import { pgPolicy, pgTable, uuid, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Budget change records — detected and user-flagged spend shifts per campaign.
 *
 * Budget changes are detected via percentage-threshold rule over campaign_metrics
 * (rolling 14-day average pre vs post). Users can also manually flag changes
 * the engine missed and dismiss auto-detected false positives.
 *
 * `source` discriminates detection origin:
 *   'auto_detected'  — found by rolling-average threshold rule (TypeScript)
 *   'user_flagged'   — manually created by the tenant user
 *
 * `status` tracks the full lifecycle:
 *   'pending_analysis' — detected/flagged, ITS scoring not yet run
 *   'analyzed'         — CausalPy ITS has computed liftImpact estimates
 *   'dismissed'        — user dismissed as false positive; dismissedAt is set
 *
 * `spendBefore` / `spendAfter`: 14-day rolling average spend before and after
 * the detected change date (USD). Null if not yet computed.
 *
 * `liftImpact` / `liftImpactLower` / `liftImpactUpper`: estimated incremental
 * lift attributable to the budget change, from CausalPy ITS posterior.
 */
export const budgetChanges = pgTable('budget_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  changeDate: date('change_date').notNull(),
  spendBefore: numeric('spend_before_avg', { precision: 12, scale: 4 }),
  spendAfter: numeric('spend_after_avg', { precision: 12, scale: 4 }),
  changePct: numeric('change_pct', { precision: 8, scale: 4 }),
  liftImpact: numeric('lift_impact', { precision: 8, scale: 6 }),
  liftImpactLower: numeric('lift_impact_lower', { precision: 8, scale: 6 }),
  liftImpactUpper: numeric('lift_impact_upper', { precision: 8, scale: 6 }),
  source: text('source').notNull(), // 'auto_detected' | 'user_flagged'
  status: text('status').notNull(), // 'pending_analysis' | 'analyzed' | 'dismissed'
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
