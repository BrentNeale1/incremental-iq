/**
 * Google Analytics 4 (GA4) connector.
 *
 * Uses @google-analytics/admin v9 for Admin API (list key events, list properties)
 * and @google-analytics/data v5 for Data API (daily event counts via runReport).
 *
 * Key behaviors:
 *   - listProperties: enumerates all GA4 properties the user has access to
 *   - listKeyEvents:  lists key events (conversion events) for a given property
 *   - fetchLeadCounts: pulls daily eventCount filtered by selected events via runReport
 *   - refreshTokenIfNeeded: standard Google OAuth token refresh
 *
 * Auth (RESEARCH.md Pattern 1):
 *   GA4 does NOT use a developer token. Auth is via an OAuth2 access token
 *   with analytics.readonly scope. The token is injected via google-auth-library.
 *
 * Date normalization (RESEARCH.md Pitfall 1):
 *   GA4 Data API returns dates as 'YYYYMMDD' — always convert to 'YYYY-MM-DD'.
 *
 * Quota management (RESEARCH.md Pitfall 2):
 *   All selected events are fetched in a single runReport call using
 *   dimensionFilter.inListFilter — one request per date range, not per event.
 *
 * All API calls wrapped with p-retry (same pattern as meta.ts and shopify.ts).
 */

import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import pRetry, { AbortError } from 'p-retry';

/** Default retry options for all GA4 API calls */
const RETRY_OPTIONS = {
  retries: 3,
  factor: 2,
  minTimeout: 5_000,   // 5s base
  maxTimeout: 60_000,  // 1 min cap
  randomize: true,
};

/**
 * Wraps an API call with p-retry. Converts GA4 quota errors to retryable
 * errors and invalid parameter errors to AbortError.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  return pRetry(async () => {
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as { code?: number; message?: string; status?: string };
      // 429 = quota exceeded — retryable
      if (error?.code === 429 || error?.status === 'RESOURCE_EXHAUSTED') {
        throw new Error(`GA4 rate limited: ${error.message}`);
      }
      // 400 = invalid parameter — not retryable
      if (error?.code === 400 || error?.status === 'INVALID_ARGUMENT') {
        throw new AbortError(`GA4 invalid argument: ${error.message}`);
      }
      throw err;
    }
  }, RETRY_OPTIONS);
}

/**
 * Builds a google-auth-library OAuth2 client from an access token and optional refresh token.
 * This is the auth injection mechanism for both Admin and Data API clients.
 */
async function buildAuthClient(
  accessToken: string,
  refreshToken?: string,
): Promise<import('google-auth-library').OAuth2Client> {
  const { OAuth2Client } = await import('google-auth-library');
  const client = new OAuth2Client(
    process.env.GA4_CLIENT_ID,
    process.env.GA4_CLIENT_SECRET,
  );
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? null,
  });
  return client;
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface GA4Property {
  propertyId: string;
  displayName: string;
}

export interface GA4KeyEvent {
  eventName: string;
  countingMethod: string;
}

// ---------------------------------------------------------------------------
// GA4Connector class
// ---------------------------------------------------------------------------

/**
 * Google Analytics 4 platform connector.
 *
 * Unlike other platform connectors, GA4Connector does NOT implement
 * PlatformConnector because GA4 is an outcome source (lead counts), not an
 * ad platform (spend/campaigns). It has a distinct method signature that
 * matches the processGA4Sync normalizer's requirements.
 */
export class GA4Connector {
  /**
   * Lists all GA4 properties the authorized user has access to.
   *
   * Calls Admin API listProperties() with no parent filter — returns all
   * properties across all accounts (RESEARCH.md Open Question 1).
   *
   * If the user has only one property, callers should auto-select it per
   * RESEARCH.md Pitfall 5 guidance.
   *
   * @param accessToken  Decrypted GA4 OAuth access token (analytics.readonly scope)
   * @param refreshToken Optional refresh token for client initialization
   * @returns Array of { propertyId, displayName }
   */
  async listProperties(
    accessToken: string,
    refreshToken?: string,
  ): Promise<GA4Property[]> {
    const authClient = await buildAuthClient(accessToken, refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminClient = new AnalyticsAdminServiceClient({ authClient: authClient as any });

    const properties: GA4Property[] = [];

    await withRetry(async () => {
      // listPropertiesAsync paginates automatically via async generator
      for await (const property of adminClient.listPropertiesAsync({})) {
        // property.name is 'properties/123456789' — extract the numeric ID
        const name = property.name ?? '';
        const propertyId = name.replace('properties/', '');
        if (propertyId) {
          properties.push({
            propertyId,
            displayName: property.displayName ?? propertyId,
          });
        }
      }
    });

    return properties;
  }

  /**
   * Lists all key events (conversion events) for a given GA4 property.
   *
   * Uses listKeyEventsAsync from the Admin API — NOT the deprecated
   * conversionEvents endpoint (RESEARCH.md State of the Art).
   *
   * @param accessToken  Decrypted GA4 OAuth access token
   * @param propertyId   GA4 property ID (numeric string, e.g., '123456789')
   * @param refreshToken Optional refresh token
   * @returns Array of { eventName, countingMethod }
   */
  async listKeyEvents(
    accessToken: string,
    propertyId: string,
    refreshToken?: string,
  ): Promise<GA4KeyEvent[]> {
    const authClient = await buildAuthClient(accessToken, refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminClient = new AnalyticsAdminServiceClient({ authClient: authClient as any });

    const keyEvents: GA4KeyEvent[] = [];

    await withRetry(async () => {
      for await (const event of adminClient.listKeyEventsAsync({
        parent: `properties/${propertyId}`,
      })) {
        keyEvents.push({
          eventName: event.eventName ?? '',
          countingMethod: event.countingMethod?.toString() ?? 'ONCE_PER_EVENT',
        });
      }
    });

    return keyEvents;
  }

  /**
   * Fetches daily event counts for selected key events from GA4 Data API.
   *
   * Uses a single runReport call with dimensionFilter.inListFilter to fetch
   * ALL selected events in one request (RESEARCH.md Pitfall 2 — quota management).
   *
   * CRITICAL: GA4 Data API returns dates as 'YYYYMMDD' (no hyphens).
   * This method normalizes to 'YYYY-MM-DD' before returning (RESEARCH.md Pitfall 1).
   *
   * @param accessToken        Decrypted GA4 OAuth access token
   * @param propertyId         GA4 property ID (numeric string)
   * @param selectedEventNames Events to count as leads (user-selected)
   * @param dateRange          Date range in ISO 'YYYY-MM-DD' format
   * @param refreshToken       Optional refresh token
   * @returns Map<date, totalLeadCount> where date is 'YYYY-MM-DD'
   */
  async fetchLeadCounts(
    accessToken: string,
    propertyId: string,
    selectedEventNames: string[],
    dateRange: { start: string; end: string },
    refreshToken?: string,
  ): Promise<Map<string, number>> {
    if (selectedEventNames.length === 0) {
      return new Map();
    }

    const authClient = await buildAuthClient(accessToken, refreshToken);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataClient = new BetaAnalyticsDataClient({ authClient: authClient as any });

    const dailyCounts = new Map<string, number>();

    await withRetry(async () => {
      const [response] = await dataClient.runReport({
        property: `properties/${propertyId}`,
        dimensions: [{ name: 'date' }, { name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dateRanges: [{ startDate: dateRange.start, endDate: dateRange.end }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: { values: selectedEventNames },
          },
        },
      });

      for (const row of response?.rows ?? []) {
        // GA4 returns dates as 'YYYYMMDD' — normalize to 'YYYY-MM-DD'
        // RESEARCH.md Pitfall 1: CRITICAL — never store YYYYMMDD format
        const rawDate = row.dimensionValues?.[0]?.value ?? '';
        const date = rawDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        const count = parseInt(row.metricValues?.[0]?.value ?? '0', 10);

        if (date && !isNaN(count)) {
          dailyCounts.set(date, (dailyCounts.get(date) ?? 0) + count);
        }
      }
    });

    return dailyCounts;
  }

  /**
   * Refreshes a GA4 OAuth access token using the stored refresh token.
   *
   * Standard Google OAuth2 refresh flow via the token endpoint.
   * Returns the new accessToken if refreshed, or the original if still valid.
   *
   * Token expiry check: treats a token as expired if tokenExpiresAt is within
   * 5 minutes of now (same buffer used by Shopify connector).
   *
   * @param accessToken  Current access token (may be expired)
   * @param refreshToken Stored refresh token
   * @param tokenExpiresAt ISO timestamp of current token expiry (epoch ms or ISO string)
   * @returns { accessToken, tokenExpiresAt } — either new values or original if fresh
   */
  async refreshTokenIfNeeded(
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt?: string | number,
  ): Promise<{ accessToken: string; tokenExpiresAt?: Date }> {
    if (tokenExpiresAt) {
      const expiryMs =
        typeof tokenExpiresAt === 'number'
          ? tokenExpiresAt
          : new Date(tokenExpiresAt).getTime();
      const fiveMinutesMs = 5 * 60 * 1000;

      if (Date.now() < expiryMs - fiveMinutesMs) {
        // Token still valid — no refresh needed
        return { accessToken };
      }
    }

    const clientId = process.env.GA4_CLIENT_ID;
    const clientSecret = process.env.GA4_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error(
        'GA4_CLIENT_ID and GA4_CLIENT_SECRET must be set for token refresh',
      );
    }

    const response = await withRetry(async () => {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }).toString(),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GA4 token refresh failed: ${res.status} ${body}`);
      }

      return res.json() as Promise<{
        access_token: string;
        expires_in?: number;
      }>;
    });

    const newExpiresAt = response.expires_in
      ? new Date(Date.now() + response.expires_in * 1000)
      : undefined;

    return {
      accessToken: response.access_token,
      tokenExpiresAt: newExpiresAt,
    };
  }
}
