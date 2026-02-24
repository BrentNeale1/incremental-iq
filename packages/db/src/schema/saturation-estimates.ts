import { pgPolicy, pgTable, uuid, text, timestamp, numeric } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Saturation estimates — per-campaign Hill function curve fitting results.
 *
 * The Hill (logistic saturation) function models spend-to-outcome diminishing
 * returns. Phase 3 uses scipy curve_fit with Hill function:
 *   f(x) = alpha * x^gamma / (mu^gamma + x^gamma)
 *
 * `saturationPct`: current spend as a fraction of theoretical saturation point
 *   (0.0–1.0). E.g., 0.72 means "this campaign is at 72% of saturation."
 *   NULL when status is 'insufficient_variation' or 'error'.
 *
 * `hillAlpha`: theoretical maximum output (revenue/conversions at full saturation)
 * `hillMu`: half-saturation point — spend level that produces 50% of max output
 * `hillGamma`: shape parameter controlling steepness of the curve
 *
 * `status` lifecycle:
 *   'estimated'               — curve fit succeeded; all parameters populated
 *   'insufficient_variation'  — spend CV too low to distinguish curve shape
 *   'error'                   — curve_fit raised RuntimeError
 */
export const saturationEstimates = pgTable('saturation_estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  estimatedAt: timestamp('estimated_at', { withTimezone: true }).notNull(),
  saturationPct: numeric('saturation_pct', { precision: 5, scale: 4 }), // 0.0000-1.0000
  hillAlpha: numeric('hill_alpha', { precision: 14, scale: 6 }),
  hillMu: numeric('hill_mu', { precision: 14, scale: 6 }),
  hillGamma: numeric('hill_gamma', { precision: 8, scale: 4 }),
  status: text('status').notNull(), // 'estimated' | 'insufficient_variation' | 'error'
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
