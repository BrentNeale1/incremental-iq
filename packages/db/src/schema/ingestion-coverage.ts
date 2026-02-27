import { pgPolicy, pgTable, uuid, text, date, timestamp, numeric, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Data completeness tracking table (ARCH-03).
 *
 * Tracks whether data for each tenant/source/date combination was
 * successfully ingested. The application checks this table to enforce
 * the "1 year minimum" gate before allowing incremental lift analysis.
 *
 * Why a table (not application memory): The analysis gate must survive
 * server restarts, deploys, and multi-instance deployments. Storing
 * coverage state in the database is the only reliable approach.
 *
 * Analysis gate query:
 *   SELECT COUNT(DISTINCT coverage_date) FROM ingestion_coverage
 *   WHERE tenant_id = $tenantId
 *     AND source IN ('shopify', 'google_ads', 'meta')
 *     AND status = 'complete'
 *     AND coverage_date >= NOW() - INTERVAL '1 year'
 *   HAVING COUNT(DISTINCT coverage_date) >= 365
 */
export const ingestionCoverage = pgTable('ingestion_coverage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  source: text('source').notNull(),               // 'meta' | 'google_ads' | 'shopify' | etc
  coverageDate: date('coverage_date').notNull(),
  status: text('status').notNull(),               // 'complete' | 'partial' | 'failed' | 'pending'
  recordCount: numeric('record_count', { precision: 12, scale: 0 }),
  ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow().notNull(),
  notes: text('notes'),                           // error messages, partial reasons
}, (t) => [
  uniqueIndex('ingestion_coverage_tenant_source_date_idx').on(t.tenantId, t.source, t.coverageDate),
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
