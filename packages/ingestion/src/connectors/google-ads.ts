import { GoogleAdsApi, Customer, enums } from 'google-ads-api';
import pRetry, { AbortError } from 'p-retry';
import { eachQuarterOfInterval, startOfQuarter, endOfQuarter, parseISO, format } from 'date-fns';
import type { ConnectorConfig, DecryptedCredentials } from '../types';
import type { PlatformConnector, RawCampaignData, RawMetricData } from '../connector-base';

/**
 * Google Ads API connector implementing PlatformConnector.
 *
 * Uses the Opteo google-ads-api library (v23) which wraps the gRPC complexity
 * of the official Google Ads API. All queries use GAQL (Google Ads Query Language).
 *
 * Key behaviors:
 *   - Supports MCC (manager) accounts via loginCustomerId (RESEARCH.md Pitfall 5)
 *   - Chunks large date ranges (>1 year) into quarterly windows to avoid response size issues
 *   - Uses p-retry with exponential backoff + jitter for all API calls
 *   - Google OAuth refresh tokens do not expire — the library handles access token refresh
 *
 * Cost data returned in micros (1,000,000 micros = $1 USD).
 * The normalizer (google-ads.ts normalizer) handles the conversion to USD.
 */

/** Retry configuration constants */
const RETRY_ATTEMPTS = 5;
const RETRY_BASE_TIMEOUT_MS = 10_000; // 10 seconds
const DAYS_PER_YEAR = 365;

/** Non-retryable Google Ads error codes */
const NON_RETRYABLE_ERROR_CODES = new Set([
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
]);

/** Retryable Google Ads error codes (rate limits, transient failures) */
const RETRYABLE_ERROR_CODES = new Set([
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'INTERNAL',
  'DEADLINE_EXCEEDED',
]);

function isRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    // Check for non-retryable patterns
    for (const code of NON_RETRYABLE_ERROR_CODES) {
      if (message.includes(code)) return false;
    }
    // Check for retryable patterns
    for (const code of RETRYABLE_ERROR_CODES) {
      if (message.includes(code)) return true;
    }
  }
  // Default to retryable for unknown errors
  return true;
}

/**
 * Creates a Customer instance for the given connector config.
 * Handles both direct accounts and MCC (manager) accounts.
 */
function createCustomer(config: ConnectorConfig): Customer {
  const { credentials } = config;
  const metadata = credentials.metadata as Record<string, unknown> | undefined;

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
  });

  // MCC (manager) accounts require loginCustomerId to pass permission checks
  // Google Ads Pitfall 5 from RESEARCH.md: missing loginCustomerId causes USER_PERMISSION_DENIED
  const customerId = metadata?.customerId as string ?? config.integrationId;
  const loginCustomerId = metadata?.loginCustomerId as string | undefined;

  return client.Customer({
    customer_id: customerId,
    login_customer_id: loginCustomerId,
    refresh_token: credentials.refreshToken ?? credentials.accessToken,
  });
}

/**
 * Splits a date range into quarterly windows to avoid response size issues
 * for large backfills (>1 year).
 */
function splitIntoQuarterlyWindows(
  start: string,
  end: string,
): Array<{ start: string; end: string }> {
  const startDate = parseISO(start);
  const endDate = parseISO(end);

  const quarters = eachQuarterOfInterval({ start: startDate, end: endDate });

  return quarters.map((quarterStart) => {
    const qStart = startOfQuarter(quarterStart);
    const qEnd = endOfQuarter(quarterStart);

    // Clamp to the requested date range
    const windowStart = qStart < startDate ? startDate : qStart;
    const windowEnd = qEnd > endDate ? endDate : qEnd;

    return {
      start: format(windowStart, 'yyyy-MM-dd'),
      end: format(windowEnd, 'yyyy-MM-dd'),
    };
  });
}

/**
 * Wraps a Google Ads API call in p-retry with exponential backoff + jitter.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(async () => {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error)) {
        throw new AbortError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }, {
    retries: RETRY_ATTEMPTS,
    minTimeout: RETRY_BASE_TIMEOUT_MS,
    randomize: true, // jitter
  });
}

export class GoogleAdsConnector implements PlatformConnector {
  /**
   * Fetches the campaign hierarchy for a Google Ads account.
   *
   * Uses GAQL to query non-removed campaigns. Google Ads does not have the same
   * ad set/ad hierarchy granularity as Meta for initial ingestion — campaign-level
   * only (ad groups can be added later if needed).
   */
  async fetchCampaigns(config: ConnectorConfig): Promise<RawCampaignData[]> {
    const customer = createCustomer(config);

    return withRetry(async () => {
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status
        FROM campaign
        WHERE campaign.status != 'REMOVED'
      `;

      const results = await customer.query(query);

      return results.map((row) => ({
        id: String(row.campaign?.id ?? ''),
        name: String(row.campaign?.name ?? ''),
        status: String(row.campaign?.status ?? ''),
        // Raw GAQL row stored for traceability
        rawRow: row,
      }));
    });
  }

  /**
   * Fetches daily campaign metrics for a given date range using GAQL.
   *
   * For date ranges > 1 year, automatically chunks into quarterly windows
   * to avoid response size issues. Each window is fetched sequentially.
   *
   * Cost data is returned in micros (1,000,000 micros = $1 USD) —
   * the normalizer handles the conversion.
   */
  async fetchMetrics(
    config: ConnectorConfig,
    dateRange: { start: string; end: string },
  ): Promise<RawMetricData[]> {
    const customer = createCustomer(config);

    // Determine if we need to chunk into quarterly windows
    const startDate = parseISO(dateRange.start);
    const endDate = parseISO(dateRange.end);
    const daysDiff = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const windows = daysDiff > DAYS_PER_YEAR
      ? splitIntoQuarterlyWindows(dateRange.start, dateRange.end)
      : [dateRange];

    const allResults: RawMetricData[] = [];

    for (const window of windows) {
      const windowResults = await withRetry(async () => {
        const query = `
          SELECT
            campaign.id,
            campaign.name,
            metrics.cost_micros,
            metrics.clicks,
            metrics.impressions,
            metrics.ctr,
            metrics.average_cpm,
            segments.date
          FROM campaign
          WHERE segments.date BETWEEN '${window.start}' AND '${window.end}'
            AND campaign.status != 'REMOVED'
        `;

        const results = await customer.query(query);

        return results.map((row) => ({
          date: String(row.segments?.date ?? ''),
          campaignId: String(row.campaign?.id ?? ''),
          campaignName: String(row.campaign?.name ?? ''),
          // Cost in micros — normalizer divides by 1,000,000 to get USD
          costMicros: row.metrics?.cost_micros ?? 0,
          clicks: row.metrics?.clicks ?? 0,
          impressions: row.metrics?.impressions ?? 0,
          ctr: row.metrics?.ctr ?? 0,
          // average_cpm also in micros — normalizer divides by 1,000,000
          averageCpm: row.metrics?.average_cpm ?? 0,
          rawRow: row,
        }));
      });

      allResults.push(...windowResults);
    }

    return allResults;
  }

  /**
   * Google OAuth refresh tokens do not expire (unless explicitly revoked by the user).
   * The google-ads-api library automatically handles access token refresh using the
   * stored refresh_token.
   *
   * If an API call fails with an authentication error, it should be thrown to trigger
   * the re-authorization flow (integration status set to 'expired').
   */
  async refreshTokenIfNeeded(config: ConnectorConfig): Promise<DecryptedCredentials> {
    // Google refresh tokens don't expire — return credentials unchanged.
    // The library handles access token refresh automatically.
    // AUTH errors bubble up from fetchCampaigns/fetchMetrics and trigger re-auth.
    return config.credentials;
  }
}
