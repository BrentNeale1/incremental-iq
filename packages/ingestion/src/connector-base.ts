import type { ConnectorConfig, DecryptedCredentials } from './types';

/**
 * Raw campaign data returned by a platform connector before normalization.
 *
 * This is intentionally generic — each platform connector (meta.ts, google-ads.ts,
 * shopify.ts) will type-narrow this with a platform-specific interface that extends
 * RawCampaignData. The base shape only guarantees the fields the normalizer needs
 * to identify a campaign row.
 */
export interface RawCampaignData {
  /** Platform's native campaign identifier (string for all three platforms) */
  id: string;
  /** Human-readable campaign name */
  name: string;
  /** Campaign status as returned by the platform API */
  status: string;
  /** Any additional platform-specific fields */
  [key: string]: unknown;
}

/**
 * Raw metric data returned by a platform connector before normalization.
 *
 * Platform connectors return arrays of RawMetricData. The normalizer transforms
 * these into NormalizedMetric rows for campaign_metrics upserts.
 *
 * The campaignId field must be populated by the connector — it's the platform's
 * native identifier that will be stored in campaign_metrics.campaignId.
 */
export interface RawMetricData {
  /** ISO date string: 'YYYY-MM-DD' */
  date: string;
  /** Platform's native campaign identifier */
  campaignId: string;
  /** Any additional platform-specific metric fields */
  [key: string]: unknown;
}

/**
 * Contract that all platform connectors must implement.
 *
 * Each of the three connectors (meta.ts, google-ads.ts, shopify.ts) implements
 * this interface. The connector is responsible for:
 *   1. Authenticating with the platform API using the decrypted credentials
 *   2. Fetching raw data (campaigns and metrics) without any transformation
 *   3. Refreshing tokens when the platform API indicates they are expired
 *
 * The connector does NOT:
 *   - Write to the database (that is the normalizer's job)
 *   - Apply retry logic (use p-retry in the calling worker)
 *   - Handle RLS context (the worker handles this)
 *
 * Error handling:
 *   - Throw platform-specific errors — callers wrap in p-retry
 *   - Token refresh failures should throw so the sync_runs row is marked 'failed'
 *     and the integration status is updated to 'expired'
 */
export interface PlatformConnector {
  /**
   * Fetches the campaign hierarchy for a given integration.
   *
   * Used on initial connect and periodic refreshes to keep the campaigns table
   * in sync with the platform's current campaign structure.
   *
   * @param config - Connector config with decrypted credentials
   * @returns Array of raw campaign data (platform-specific structure)
   */
  fetchCampaigns(config: ConnectorConfig): Promise<RawCampaignData[]>;

  /**
   * Fetches daily campaign metrics for a given date range.
   *
   * Called by both the incremental sync worker (last 2 days) and the
   * backfill worker (month-by-month historical chunks).
   *
   * Note (Meta): For date ranges > ~7 days at ad-level, Meta requires async
   * reporting. The Meta connector implementation must handle this internally
   * using the BullMQ delayed job polling pattern from RESEARCH.md Pattern 7.
   *
   * @param config - Connector config with decrypted credentials
   * @param dateRange - Start and end dates (ISO format: 'YYYY-MM-DD')
   * @returns Array of raw metric data (platform-specific structure)
   */
  fetchMetrics(
    config: ConnectorConfig,
    dateRange: { start: string; end: string }
  ): Promise<RawMetricData[]>;

  /**
   * Refreshes the OAuth access token if it is expired or about to expire.
   *
   * The caller (ingestion worker) should invoke this before fetchCampaigns or
   * fetchMetrics and persist the returned credentials back to the integrations table.
   *
   * Token refresh behavior by platform:
   *   Meta:        Long-lived tokens (60 days) — exchange before expiry
   *   Google Ads:  Standard OAuth2 refresh_token flow
   *   Shopify:     Expiring offline tokens (1hr + 90-day refresh) — required since Dec 2025
   *
   * @param config - Current connector config (credentials may be expired)
   * @returns Fresh DecryptedCredentials to replace the stored tokens
   * @throws If the refresh token is also expired — caller must set integration status to 'expired'
   */
  refreshTokenIfNeeded(config: ConnectorConfig): Promise<DecryptedCredentials>;
}
