import { pgPolicy, pgTable, uuid, date, text, numeric, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Campaign metrics fact table with dual attribution columns (ARCH-02).
 *
 * Both direct and modeled attribution values live in the same row to avoid
 * joins at dashboard query time. The `direct_*` columns are populated by the
 * ingestion pipeline (Phase 2) from Shopify/CRM ground truth. The `modeled_*`
 * columns are populated by the statistical engine (Phase 3) and are NULL
 * until that engine runs.
 *
 * NULL semantics:
 *   direct_revenue IS NOT NULL     = trackable attribution available
 *   modeled_revenue IS NULL        = statistical engine hasn't run yet
 *   modeled_confidence < 0.5       = low-confidence estimate, show warning
 *
 * No UUID primary key: TimescaleDB hypertable pattern uses the unique index
 * as the deduplication constraint (Open Question 1 from RESEARCH.md).
 *
 * Pitfall 5: Missing unique constraint causes duplicate metrics on retries.
 * The unique index on (tenant_id, campaign_id, date, source) enables
 * INSERT ... ON CONFLICT DO UPDATE (upsert) semantics in the ingestion pipeline.
 */
export const campaignMetrics = pgTable('campaign_metrics', {
  // Time column MUST be NOT NULL for TimescaleDB hypertables
  date: date('date').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  source: text('source').notNull(),

  // Spend (always available from ad platforms)
  spendUsd: numeric('spend_usd', { precision: 12, scale: 4 }),

  // ARCH-02: Direct (trackable) attribution — from Shopify/CRM ground truth
  directRevenue: numeric('direct_revenue', { precision: 14, scale: 4 }),
  directConversions: numeric('direct_conversions', { precision: 10, scale: 2 }),
  directRoas: numeric('direct_roas', { precision: 8, scale: 4 }),

  // ARCH-02: Modeled (estimated) attribution — populated by Phase 3 engine, NULL until then
  modeledRevenue: numeric('modeled_revenue', { precision: 14, scale: 4 }),
  modeledConversions: numeric('modeled_conversions', { precision: 10, scale: 2 }),
  modeledRoas: numeric('modeled_roas', { precision: 8, scale: 4 }),
  modeledIncrementalLift: numeric('modeled_incremental_lift', { precision: 8, scale: 6 }),
  modeledLiftLower: numeric('modeled_lift_lower', { precision: 8, scale: 6 }),
  modeledLiftUpper: numeric('modeled_lift_upper', { precision: 8, scale: 6 }),
  modeledConfidence: numeric('modeled_confidence', { precision: 5, scale: 4 }),
  modeledAt: timestamp('modeled_at', { withTimezone: true }),

  // Impression/click data
  impressions: numeric('impressions', { precision: 14, scale: 0 }),
  clicks: numeric('clicks', { precision: 12, scale: 0 }),
  ctr: numeric('ctr', { precision: 8, scale: 6 }),
  cpm: numeric('cpm', { precision: 10, scale: 4 }),
}, (t) => [
  // Pitfall 5: unique constraint enables upsert semantics in ingestion pipeline
  uniqueIndex('campaign_metrics_unique').on(t.tenantId, t.campaignId, t.date, t.source),
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
