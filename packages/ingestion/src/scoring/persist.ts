/**
 * Score persistence — write Python sidecar results to database tables.
 *
 * Persists:
 *   - TWO incrementality_scores rows per campaign (adjusted + raw) for dual output
 *   - saturation_estimates row with Hill function curve parameters
 *   - campaign_metrics modeled_* columns update for recent date range (ARCH-02)
 *
 * Per user decision: "Dual output: show both seasonally-adjusted and raw
 * (unadjusted) incrementality scores." The score_type discriminator enables
 * both to coexist in the same table without JOIN overhead.
 *
 * ARCH-02: Dual attribution in same row — modeled_* columns updated with
 * adjusted score values alongside existing direct_* columns.
 */

import { sql, and, eq, gte } from 'drizzle-orm';
import {
  db,
  withTenant,
  incrementalityScores,
  saturationEstimates,
  campaignMetrics,
} from '@incremental-iq/db';

// ---------------------------------------------------------------------------
// Result types (from Python sidecar)
// ---------------------------------------------------------------------------

/** Dual incrementality score result from /incrementality endpoint. */
export interface IncrementalityResult {
  /** Seasonally-adjusted ITS score (primary output). */
  adjusted: {
    lift_mean: number;
    lift_lower: number;
    lift_upper: number;
    confidence: number;
    data_points: number;
    status: 'scored' | 'insufficient_data' | 'pooled_estimate' | 'error';
  };
  /** Raw (unadjusted) rolling mean score for comparison. */
  raw: {
    lift_mean: number;
    lift_lower: number;
    lift_upper: number;
    confidence: number;
    data_points: number;
    status: 'scored' | 'insufficient_data' | 'pooled_estimate' | 'error';
  };
  /** Original model output for debugging/audit. */
  raw_model_output?: unknown;
}

/** Saturation curve fit result from /saturation endpoint. */
export interface SaturationResult {
  saturation_pct: number | null;
  hill_alpha: number | null;
  hill_mu: number | null;
  hill_gamma: number | null;
  status: 'estimated' | 'insufficient_variation' | 'error';
}

/** Anomaly detection result from /anomalies endpoint. */
export interface AnomalyResult {
  anomalies: Array<{
    date: string;
    metric: string;
    zscore: number;
    direction: 'up' | 'down';
  }>;
}

/** Complete results bundle from all Python sidecar endpoints. */
export interface ScoringResults {
  incrementality: IncrementalityResult;
  saturation: SaturationResult;
  anomalies: AnomalyResult;
}

// ---------------------------------------------------------------------------
// Persistence function
// ---------------------------------------------------------------------------

/**
 * Persist all Python sidecar scoring results to the database.
 *
 * Operations:
 *   1. Insert/update TWO incrementality_scores rows (adjusted + raw)
 *   2. Insert saturation_estimates row
 *   3. Update campaign_metrics modeled_* columns for last 30 days (ARCH-02)
 *
 * Uses withTenant() for RLS context on all queries.
 *
 * @param tenantId   - Tenant UUID for RLS context and isolation.
 * @param campaignId - Campaign UUID these results belong to.
 * @param results    - Complete scoring results from the Python sidecar.
 */
export async function persistScores(
  tenantId: string,
  campaignId: string,
  results: ScoringResults,
  marketId: string | null = null,
): Promise<void> {
  await withTenant(tenantId, async () => {
    const scoredAt = new Date();

    // -----------------------------------------------------------------------
    // 1. Insert adjusted incrementality score
    // -----------------------------------------------------------------------
    const { adjusted, raw, raw_model_output } = results.incrementality;

    await db.insert(incrementalityScores).values({
      tenantId,
      campaignId,
      scoredAt,
      scoreType: 'adjusted',
      liftMean: adjusted.lift_mean.toFixed(6),
      liftLower: adjusted.lift_lower.toFixed(6),
      liftUpper: adjusted.lift_upper.toFixed(6),
      confidence: adjusted.confidence.toFixed(4),
      dataPoints: String(adjusted.data_points),
      status: adjusted.status,
      rawModelOutput: raw_model_output ?? null,
      marketId,
    });

    // -----------------------------------------------------------------------
    // 2. Insert raw (unadjusted) incrementality score
    // -----------------------------------------------------------------------
    await db.insert(incrementalityScores).values({
      tenantId,
      campaignId,
      scoredAt,
      scoreType: 'raw',
      liftMean: raw.lift_mean.toFixed(6),
      liftLower: raw.lift_lower.toFixed(6),
      liftUpper: raw.lift_upper.toFixed(6),
      confidence: raw.confidence.toFixed(4),
      dataPoints: String(raw.data_points),
      status: raw.status,
      rawModelOutput: null,
      marketId,
    });

    // -----------------------------------------------------------------------
    // 3. Insert saturation estimate
    // -----------------------------------------------------------------------
    const { saturation } = results;
    await db.insert(saturationEstimates).values({
      tenantId,
      campaignId,
      estimatedAt: scoredAt,
      saturationPct: saturation.saturation_pct !== null
        ? saturation.saturation_pct.toFixed(4)
        : null,
      hillAlpha: saturation.hill_alpha !== null
        ? saturation.hill_alpha.toFixed(6)
        : null,
      hillMu: saturation.hill_mu !== null
        ? saturation.hill_mu.toFixed(6)
        : null,
      hillGamma: saturation.hill_gamma !== null
        ? saturation.hill_gamma.toFixed(4)
        : null,
      status: saturation.status,
    });

    // -----------------------------------------------------------------------
    // 4. Update campaign_metrics modeled_* columns (ARCH-02 dual attribution)
    //
    // Updates rows for the last 30 days with the adjusted score values.
    // This allows the dashboard to show modeled attribution alongside direct
    // attribution without a separate join on incrementality_scores.
    //
    // Only update if the adjusted score was successfully computed.
    // -----------------------------------------------------------------------
    if (adjusted.status === 'scored' || adjusted.status === 'pooled_estimate') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

      await db
        .update(campaignMetrics)
        .set({
          modeledIncrementalLift: adjusted.lift_mean.toFixed(6),
          modeledLiftLower: adjusted.lift_lower.toFixed(6),
          modeledLiftUpper: adjusted.lift_upper.toFixed(6),
          modeledConfidence: adjusted.confidence.toFixed(4),
          modeledAt: scoredAt,
        })
        .where(and(
          eq(campaignMetrics.tenantId, tenantId),
          eq(campaignMetrics.campaignId, campaignId),
          gte(campaignMetrics.date, thirtyDaysAgoStr),
        ));
    }
  });
}
