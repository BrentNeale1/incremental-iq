/**
 * Shared TypeScript types for the ingestion pipeline.
 *
 * These types form the contract between:
 *   - OAuth credential management (stores encrypted tokens in DB)
 *   - Platform connectors (Meta, Google Ads, Shopify)
 *   - Normalizers (raw API responses → campaign_metrics rows)
 *   - BullMQ job scheduler (enqueues sync and backfill jobs)
 */

// ---------------------------------------------------------------------------
// Platform identifiers
// ---------------------------------------------------------------------------

/** Supported ad platforms. Matches the `platform` column in integrations/sync_runs. */
export type Platform = 'meta' | 'google_ads' | 'shopify';

// ---------------------------------------------------------------------------
// Sync job types
// ---------------------------------------------------------------------------

/** Type of sync run. Matches the `run_type` column in sync_runs. */
export type SyncType = 'incremental' | 'backfill' | 'manual';

/** Status of a sync run. Matches the `status` column in sync_runs. */
export type SyncStatus = 'running' | 'success' | 'partial' | 'failed';

/** Status of an integration. Matches the `status` column in integrations. */
export type IntegrationStatus = 'connected' | 'error' | 'expired';

// ---------------------------------------------------------------------------
// Connector configuration
// ---------------------------------------------------------------------------

/**
 * Decrypted OAuth credentials passed to connector methods at runtime.
 * Never persisted to the database — always decrypt on use, keep in memory only.
 */
export interface DecryptedCredentials {
  accessToken: string;
  refreshToken?: string;
  /** Platform-specific extras (e.g., loginCustomerId for Google Ads MCC accounts) */
  metadata?: Record<string, unknown>;
}

/**
 * Full configuration passed to every PlatformConnector method.
 * Provides tenant isolation context alongside the decrypted credentials.
 */
export interface ConnectorConfig {
  tenantId: string;
  platform: Platform;
  integrationId: string;
  credentials: DecryptedCredentials;
}

// ---------------------------------------------------------------------------
// Job data types (passed to BullMQ job queues)
// ---------------------------------------------------------------------------

/**
 * Data payload for a sync job enqueued in BullMQ.
 * Both incremental and backfill jobs use this shape.
 */
export interface SyncJobData {
  tenantId: string;
  platform: Platform;
  integrationId: string;
  type: SyncType;
  /** Required for backfill jobs; optional for incremental (defaults to last 2 days) */
  dateRange?: {
    start: string; // ISO date string: 'YYYY-MM-DD'
    end: string;   // ISO date string: 'YYYY-MM-DD'
  };
}

// ---------------------------------------------------------------------------
// Progress tracking
// ---------------------------------------------------------------------------

/**
 * Backfill progress stored in sync_runs.progressMetadata.
 * Displayed in the UI as: "Meta Ads: 14 of 36 months pulled"
 */
export interface BackfillProgress {
  completed: number;
  total: number;
  unit: string; // typically 'months'
}

// ---------------------------------------------------------------------------
// Normalized metric type
// ---------------------------------------------------------------------------

/**
 * A normalized metric row ready for insert into campaign_metrics.
 * Matches the Drizzle insert shape for campaignMetrics table.
 *
 * The source column identifies the originating platform (e.g., 'meta', 'google_ads').
 * The ctr, cpm columns are derived from spend/impressions/clicks during normalization.
 *
 * Direct attribution columns (directRevenue, directConversions, directRoas) come from
 * Shopify/CRM data — they are NOT available from ad platform connectors and will be
 * null until the Shopify connector populates them via a join on campaign attribution data.
 *
 * Modeled columns are always null at ingestion time — populated by Phase 3 engine.
 */
export interface NormalizedMetric {
  date: string;           // ISO date string: 'YYYY-MM-DD'
  tenantId: string;
  campaignId: string;
  source: string;         // Platform identifier: 'meta' | 'google_ads' | 'shopify'
  spendUsd?: string;      // Numeric string for Drizzle numeric() type
  impressions?: string;
  clicks?: string;
  ctr?: string;           // Derived: clicks / impressions
  cpm?: string;           // Derived: (spend / impressions) * 1000
  directRevenue?: string;
  directConversions?: string;
  directRoas?: string;
}
