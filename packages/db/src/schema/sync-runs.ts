import { pgPolicy, pgTable, uuid, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';
import { integrations } from './integrations';

/**
 * Sync run history per integration.
 *
 * Every sync attempt (incremental nightly, backfill, or manual) creates a row.
 * The UI shows the last 5-7 rows per integration to help diagnose recurring failures.
 *
 * runType values:
 *   incremental — nightly scheduled sync pulling recent data
 *   backfill    — historical pull from max lookback to present (triggered on first connect)
 *   manual      — user-initiated "Sync now" (rate-limited to prevent API abuse)
 *
 * status lifecycle:
 *   running  → job is currently executing
 *   success  → all records retrieved and written
 *   partial  → some records written but job stopped early (rate limit, error)
 *   failed   → no records written, error logged in errorMessage
 *
 * progressMetadata is used for live backfill progress UI:
 *   { completed: 14, total: 36, unit: 'months' }
 *   → "Meta Ads: 14 of 36 months pulled"
 *
 * RLS note (RESEARCH.md Pitfall 6): BullMQ workers must set
 * app.current_tenant_id before querying this table, or use a superuser
 * connection with explicit WHERE tenant_id = $tenantId filtering.
 */
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id),
  platform: text('platform').notNull(),
  runType: text('run_type').notNull(),                    // 'incremental' | 'backfill' | 'manual'
  status: text('status').notNull(),                       // 'running' | 'success' | 'partial' | 'failed'
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  recordsIngested: numeric('records_ingested', { precision: 12, scale: 0 }),
  errorMessage: text('error_message'),
  // Backfill progress tracking: { completed: 14, total: 36, unit: 'months' }
  progressMetadata: jsonb('progress_metadata'),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
