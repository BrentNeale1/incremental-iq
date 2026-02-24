/**
 * Meta Ads API connector implementing PlatformConnector.
 *
 * Uses facebook-nodejs-business-sdk v23 for all API interactions.
 *
 * Key behaviors:
 *   - fetchCampaigns: pulls full campaign hierarchy (campaigns -> ad sets -> ads)
 *   - fetchMetrics: daily campaign-level insights with async reporting for ranges > 7 days
 *   - refreshTokenIfNeeded: exchanges long-lived token (60-day) before expiry window
 *
 * Rate limiting (RESEARCH.md Pattern 5):
 *   - All API calls wrapped in p-retry with exponential backoff + jitter
 *   - Error code 17 and 613 = rate limit -> retry
 *   - Error code 100 = invalid parameter -> AbortError (no retry)
 *   - p-limit(3) for concurrency control on concurrent calls
 *
 * Attribution window (RESEARCH.md Pitfall 1):
 *   - After Jan 12 2026, Meta uses unified attribution (7d_click only by default)
 *   - Attribution window is stored alongside every raw pull by normalizer via storeRawPull()
 *
 * Historical data limits (RESEARCH.md Pitfall 2):
 *   - Only aggregate totals (spend, impressions, clicks, ctr, cpm) are requested
 *   - No unique-count or breakdown fields -- those are capped at 13 months
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const adsSdk = require('facebook-nodejs-business-sdk') as {
  FacebookAdsApi: {
    init: (token: string) => void;
  };
  AdAccount: new (id: string) => MetaAdAccount;
  Campaign: { Fields: Record<string, string> };
  AdSet: { Fields: Record<string, string> };
  Ad: { Fields: Record<string, string> };
};

import pRetry, { AbortError } from 'p-retry';
import pLimit from 'p-limit';
import type { ConnectorConfig, DecryptedCredentials } from '../types';
import type { PlatformConnector, RawCampaignData, RawMetricData } from '../connector-base';

/** Internal type for the facebook SDK AdAccount object */
interface MetaAdAccount {
  getCampaigns(fields: string[], params: Record<string, unknown>): Promise<MetaApiObject[]>;
  getInsights(fields: string[], params: Record<string, unknown>): Promise<MetaApiObject[]>;
  getInsightsAsync(fields: string[], params: Record<string, unknown>): Promise<MetaAsyncJob>;
}

/** Generic Meta SDK object with dynamic field access */
interface MetaApiObject {
  [key: string]: unknown;
  getCampaigns?: (fields: string[], params: Record<string, unknown>) => Promise<MetaApiObject[]>;
  getAdSets?: (fields: string[], params: Record<string, unknown>) => Promise<MetaApiObject[]>;
  getAds?: (fields: string[], params: Record<string, unknown>) => Promise<MetaApiObject[]>;
}

/** Meta async insights job object */
interface MetaAsyncJob {
  get(fields: string[]): Promise<{ async_status: string; async_percent_completion: number }>;
  getResult(fields: string[]): Promise<MetaApiObject[]>;
}

const { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad } = adsSdk;

/** Concurrency limit: no more than 3 simultaneous Meta API calls per account */
const limit = pLimit(3);

/** Days before token expiry to trigger a refresh (Meta tokens last ~60 days) */
const TOKEN_REFRESH_THRESHOLD_DAYS = 7;

/** Default retry options for all Meta API calls (RESEARCH.md Pattern 5) */
const RETRY_OPTIONS = {
  retries: 5,
  factor: 2,
  minTimeout: 30_000,   // 30s base -- Meta rate limit recovery window
  maxTimeout: 600_000,  // 10 min cap
  randomize: true,      // jitter to spread retries across concurrent callers
};

/** Meta async job polling: every 60s, up to 60 attempts = 1 hour max */
const ASYNC_POLL_INTERVAL_MS = 60_000;
const ASYNC_POLL_MAX_ATTEMPTS = 60;

/** Threshold: use async reporting for date ranges > 7 days (RESEARCH.md Pitfall 7) */
const ASYNC_REPORTING_THRESHOLD_DAYS = 7;

/**
 * Meta-specific campaign data returned by fetchCampaigns.
 * Extends RawCampaignData with Meta hierarchy.
 */
export interface MetaRawCampaignData extends RawCampaignData {
  adSets: MetaRawAdSetData[];
}

export interface MetaRawAdSetData {
  id: string;
  name: string;
  status: string;
  ads: MetaRawAdData[];
  [key: string]: unknown;
}

export interface MetaRawAdData {
  id: string;
  name: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Meta-specific metric data returned by fetchMetrics.
 * Daily campaign-level insights row.
 */
export interface MetaRawMetricData extends RawMetricData {
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  cpm: string;
  cpc: string;
  dateStart: string;
  dateStop: string;
}

/**
 * Wraps an API call with p-retry, converting Meta error codes to
 * either retryable errors (rate limits) or AbortError (invalid params).
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(async () => {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string };
      // Meta rate limit codes: 17 = app-level, 613 = ad account level
      if (error?.code === 17 || error?.code === 613) {
        throw new Error(`Meta rate limited (code ${error.code}): ${error.message}`);
      }
      // Code 100 = invalid parameter -- not retryable
      if (error?.code === 100) {
        throw new AbortError(`Meta invalid parameter (code 100): ${error.message}`);
      }
      // Re-throw all other errors for p-retry to handle
      throw err;
    }
  }, RETRY_OPTIONS);
}

/**
 * Calculates number of days between two ISO date strings.
 */
function daysBetween(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
}

/**
 * Polls a Meta async insights job until complete or timeout.
 * Resolves with the completed async job object.
 */
async function pollAsyncJob(asyncJob: MetaAsyncJob): Promise<MetaAsyncJob> {
  for (let attempt = 0; attempt < ASYNC_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, ASYNC_POLL_INTERVAL_MS));

    const jobStatus = await withRetry(() =>
      asyncJob.get(['async_percent_completion', 'async_status'])
    );

    if (jobStatus.async_status === 'Job Completed') {
      return asyncJob;
    }
    if (jobStatus.async_status === 'Job Failed' || jobStatus.async_status === 'Job Skipped') {
      throw new Error(`Meta async job failed with status: ${jobStatus.async_status}`);
    }
    // Still running -- continue polling
  }
  throw new Error(
    `Meta async insights job timed out after ${ASYNC_POLL_MAX_ATTEMPTS} polling attempts (${ASYNC_POLL_MAX_ATTEMPTS} minutes)`
  );
}

/**
 * Meta Ads platform connector.
 *
 * Implements PlatformConnector for the Meta Marketing API v23.
 * All API calls use p-retry with exponential backoff + jitter.
 */
export class MetaConnector implements PlatformConnector {
  /**
   * Fetches the full campaign hierarchy for a given ad account.
   *
   * Returns campaigns -> ad sets -> ads as a nested structure.
   * Uses limit: 500 to minimize pagination for typical accounts.
   * Processes campaigns concurrently (up to p-limit(3) at a time).
   *
   * @param config - ConnectorConfig with decrypted Meta access token
   * @returns Array of MetaRawCampaignData with nested ad sets and ads
   */
  async fetchCampaigns(config: ConnectorConfig): Promise<RawCampaignData[]> {
    const { accessToken, metadata } = config.credentials;
    const adAccountId = (metadata as Record<string, unknown>)?.adAccountId as string;

    if (!adAccountId) {
      throw new AbortError('Meta connector requires credentials.metadata.adAccountId');
    }

    // Initialize the SDK with the decrypted access token
    FacebookAdsApi.init(accessToken);
    const account = new AdAccount(`act_${adAccountId}`);

    // Fetch all campaigns for this ad account
    const rawCampaigns = await withRetry(() =>
      account.getCampaigns(
        [Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.status],
        { limit: 500 }
      )
    );

    // Fetch ad sets and ads for each campaign concurrently (respects p-limit)
    const campaigns: MetaRawCampaignData[] = await Promise.all(
      rawCampaigns.map((campaign: MetaApiObject) =>
        limit(async () => {
          // Fetch ad sets for this campaign
          const rawAdSets = await withRetry(() =>
            campaign.getAdSets!(
              [AdSet.Fields.id, AdSet.Fields.name, AdSet.Fields.status],
              { limit: 500 }
            )
          );

          // Fetch ads for each ad set concurrently
          const adSets: MetaRawAdSetData[] = await Promise.all(
            rawAdSets.map((adSet: MetaApiObject) =>
              limit(async () => {
                const rawAds = await withRetry(() =>
                  adSet.getAds!(
                    [Ad.Fields.id, Ad.Fields.name, Ad.Fields.status],
                    { limit: 500 }
                  )
                );

                return {
                  id: adSet[AdSet.Fields.id] as string,
                  name: adSet[AdSet.Fields.name] as string,
                  status: adSet[AdSet.Fields.status] as string,
                  ads: rawAds.map((ad: MetaApiObject) => ({
                    id: ad[Ad.Fields.id] as string,
                    name: ad[Ad.Fields.name] as string,
                    status: ad[Ad.Fields.status] as string,
                  })),
                } satisfies MetaRawAdSetData;
              })
            )
          );

          return {
            id: campaign[Campaign.Fields.id] as string,
            name: campaign[Campaign.Fields.name] as string,
            status: campaign[Campaign.Fields.status] as string,
            adSets,
          } satisfies MetaRawCampaignData;
        })
      )
    );

    return campaigns;
  }

  /**
   * Fetches daily campaign-level metrics for a given date range.
   *
   * For date ranges <= 7 days: uses synchronous account.getInsights()
   * For date ranges > 7 days: uses async reporting (RESEARCH.md Pitfall 7)
   *   - Submits async job via account.getInsightsAsync()
   *   - Polls every 60 seconds until complete (max 60 attempts = 1 hour)
   *
   * Fields requested: spend, impressions, clicks, cpc, cpm, ctr
   * Only aggregate totals -- no unique-count or breakdown fields (RESEARCH.md Pitfall 2)
   *
   * @param config - ConnectorConfig with decrypted Meta access token
   * @param dateRange - Start and end ISO dates ('YYYY-MM-DD')
   * @returns Array of MetaRawMetricData (daily campaign-level rows)
   */
  async fetchMetrics(
    config: ConnectorConfig,
    dateRange: { start: string; end: string }
  ): Promise<RawMetricData[]> {
    const { accessToken, metadata } = config.credentials;
    const adAccountId = (metadata as Record<string, unknown>)?.adAccountId as string;

    if (!adAccountId) {
      throw new AbortError('Meta connector requires credentials.metadata.adAccountId');
    }

    FacebookAdsApi.init(accessToken);
    const account = new AdAccount(`act_${adAccountId}`);

    // Fields per RESEARCH.md -- aggregate totals only, no breakdown fields
    const insightFields = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr'];
    const insightParams = {
      time_range: { since: dateRange.start, until: dateRange.end },
      level: 'campaign',
      time_increment: 1, // daily granularity
    };

    const days = daysBetween(dateRange.start, dateRange.end);
    let rawInsights: MetaApiObject[];

    if (days > ASYNC_REPORTING_THRESHOLD_DAYS) {
      // Use async reporting for large date ranges (RESEARCH.md Pitfall 7)
      const asyncJob = await withRetry(() =>
        account.getInsightsAsync(insightFields, { ...insightParams, async: true })
      );

      // Poll until the job completes
      const completedJob = await pollAsyncJob(asyncJob);

      // Retrieve results from the completed job
      rawInsights = await withRetry(() =>
        completedJob.getResult(insightFields)
      );
    } else {
      // Use synchronous insights for short ranges
      rawInsights = await withRetry(() =>
        account.getInsights(insightFields, insightParams)
      );
    }

    // Map SDK response to RawMetricData shape
    return rawInsights.map((row: MetaApiObject): MetaRawMetricData => ({
      // RawMetricData base fields
      date: row['date_start'] as string,
      campaignId: row['campaign_id'] as string,
      // Meta-specific fields
      spend: (row['spend'] as string) ?? '0',
      impressions: (row['impressions'] as string) ?? '0',
      clicks: (row['clicks'] as string) ?? '0',
      ctr: (row['ctr'] as string) ?? '0',
      cpm: (row['cpm'] as string) ?? '0',
      cpc: (row['cpc'] as string) ?? '0',
      dateStart: row['date_start'] as string,
      dateStop: row['date_stop'] as string,
    }));
  }

  /**
   * Refreshes the Meta long-lived access token if within 7 days of expiry.
   *
   * Meta long-lived tokens last ~60 days. This method checks tokenExpiresAt
   * from the integration record and exchanges for a fresh long-lived token
   * via the Graph API if within the refresh threshold.
   *
   * If tokenExpiresAt is not set or the token is still fresh, returns the
   * original credentials unchanged.
   *
   * @param config - Current connector config (may have soon-to-expire token)
   * @returns Fresh DecryptedCredentials (or unchanged if no refresh needed)
   */
  async refreshTokenIfNeeded(config: ConnectorConfig): Promise<DecryptedCredentials> {
    const { accessToken, metadata } = config.credentials;
    const meta = metadata as Record<string, unknown>;
    const tokenExpiresAt = meta?.tokenExpiresAt as string | undefined;

    if (!tokenExpiresAt) {
      // No expiry stored -- cannot determine if refresh is needed
      // Return as-is; the OAuth handler should have stored expiry on initial connect
      return config.credentials;
    }

    const expiryMs = new Date(tokenExpiresAt).getTime();
    const nowMs = Date.now();
    const daysUntilExpiry = (expiryMs - nowMs) / (1000 * 60 * 60 * 24);

    if (daysUntilExpiry > TOKEN_REFRESH_THRESHOLD_DAYS) {
      // Token still fresh -- no refresh needed
      return config.credentials;
    }

    // Exchange for a new long-lived token via Graph API
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error(
        'FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set for Meta token refresh'
      );
    }

    const url = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', accessToken);

    const response = await withRetry(async () => {
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Meta token refresh failed: ${res.status} ${body}`);
      }
      return res.json() as Promise<{ access_token: string; expires_in?: number }>;
    });

    const newExpiresAt = response.expires_in
      ? new Date(Date.now() + response.expires_in * 1000).toISOString()
      : undefined;

    return {
      accessToken: response.access_token,
      refreshToken: config.credentials.refreshToken,
      metadata: {
        ...meta,
        ...(newExpiresAt ? { tokenExpiresAt: newExpiresAt } : {}),
      },
    };
  }
}
