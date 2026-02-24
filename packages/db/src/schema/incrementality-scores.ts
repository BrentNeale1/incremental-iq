import { pgPolicy, pgTable, uuid, text, timestamp, numeric, jsonb, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Incrementality scores — one row per campaign per model run.
 *
 * The `score_type` discriminator separates seasonally-adjusted scores
 * ('adjusted') from raw unadjusted scores ('raw') so both can be stored
 * and queried independently per campaign (user decision: dual output).
 *
 * The `status` column captures the full lifecycle:
 *   'scored'              — valid Bayesian posterior estimate produced
 *   'pooled_estimate'     — insufficient campaign data; borrowed from cluster prior
 *   'insufficient_data'   — below minimum data threshold, no estimate possible
 *   'error'               — Python model failed; rawModelOutput has error details
 *
 * The nullable `market_id` is a STAT-05 scaffold for Phase 5 geo-based testing.
 * In Phase 3 this is always NULL (single-market campaign-level scoring).
 *
 * Composite index on (tenant_id, campaign_id, score_type, scored_at DESC) enables
 * efficient latest-score lookups per campaign for both adjusted and raw variants.
 */
export const incrementalityScores = pgTable('incrementality_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull(),
  scoredAt: timestamp('scored_at', { withTimezone: true }).notNull(),
  scoreType: text('score_type').notNull(), // 'adjusted' | 'raw'
  liftMean: numeric('lift_mean', { precision: 8, scale: 6 }),
  liftLower: numeric('lift_lower', { precision: 8, scale: 6 }),
  liftUpper: numeric('lift_upper', { precision: 8, scale: 6 }),
  confidence: numeric('confidence', { precision: 5, scale: 4 }),
  dataPoints: numeric('data_points', { precision: 8, scale: 0 }),
  status: text('status').notNull(), // 'scored' | 'pooled_estimate' | 'insufficient_data' | 'error'
  rawModelOutput: jsonb('raw_model_output'),
  // STAT-05 scaffold — Phase 5 geo-based testing; NULL in Phase 3
  marketId: uuid('market_id'),
}, (t) => [
  index('incrementality_scores_lookup_idx').on(t.tenantId, t.campaignId, t.scoreType, t.scoredAt),
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
