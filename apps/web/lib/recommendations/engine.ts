/**
 * Recommendation engine — converts Phase 3 statistical outputs into
 * actionable budget recommendations.
 *
 * Key business rules (from CONTEXT.md locked decisions):
 * - Scale-up is the primary path when confidence is sufficient
 * - Holdout tests are NEVER the first option — only offered as secondary
 *   accelerator when confidence is too low to recommend scaling
 * - Rollup sentinel rows are filtered out (never shown as campaign rows)
 * - Recommendations sorted by expectedImpact DESC (highest revenue first)
 */

import { withTenant } from '@incremental-iq/db';
import {
  incrementalityScores,
  saturationEstimates,
  campaigns,
  campaignMetrics,
  campaignMarkets,
} from '@incremental-iq/db';
import { eq, and, desc, sql, avg } from 'drizzle-orm';
import { addDays, formatISO } from 'date-fns';
import { getUpcomingSeasonalAlerts } from './seasonal';
import type { Recommendation, HoldoutTestDesign, RecommendationConfidenceLevel } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum confidence level to generate a scale-up recommendation */
export const SCALE_UP_CONFIDENCE_THRESHOLD = 0.65;

/** Campaigns at or above this saturation pct have no headroom to scale */
export const SATURATION_HEADROOM_CUTOFF = 0.80;

/** Maximum budget increase recommended (50% cap) */
export const MAX_BUDGET_INCREASE_PCT = 50;

/** Default recommendation duration in weeks */
export const DEFAULT_DURATION_WEEKS = 3;

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface ScoreRow {
  campaignId: string;
  status: string;
  liftMean: string | null;
  liftLower: string | null;
  liftUpper: string | null;
  confidence: string | null;
}

interface SaturationRow {
  campaignId: string;
  saturationPct: string | null;
  hillAlpha: string | null;
  hillMu: string | null;
  hillGamma: string | null;
  status: string;
}

interface CampaignRow {
  id: string;
  name: string;
  source: string;
  funnelStage: string | null;
}

// ---------------------------------------------------------------------------
// computeBudgetRecommendation
// ---------------------------------------------------------------------------

/**
 * Given Hill curve parameters and current spend, compute the optimal budget
 * increase to 75th percentile of remaining headroom (capped at 50%).
 *
 * Returns null if saturation >= SATURATION_HEADROOM_CUTOFF (no headroom).
 */
export function computeBudgetRecommendation(
  currentSpendDaily: number,
  hillAlpha: number,
  hillMu: number,
  hillGamma: number,
  saturationPct: number,
  liftMean: number,
): {
  budgetIncreasePct: number;
  proposedDailySpend: number;
  durationWeeks: number;
  expectedIncrementalRevenue: number;
} | null {
  if (saturationPct >= SATURATION_HEADROOM_CUTOFF) {
    return null;
  }

  // Current revenue from Hill function: f(x) = alpha * x^gamma / (mu^gamma + x^gamma)
  const hillFn = (x: number): number =>
    hillAlpha * Math.pow(x, hillGamma) /
    (Math.pow(hillMu, hillGamma) + Math.pow(x, hillGamma));

  const currentRevenue = hillFn(currentSpendDaily);

  // Scale to 75th percentile of remaining headroom, capped at MAX_BUDGET_INCREASE_PCT
  const headroomPct = 1.0 - saturationPct;
  const rawScaleFactor = 1.0 + headroomPct * 0.75;
  const scaleFactor = Math.min(rawScaleFactor, 1 + MAX_BUDGET_INCREASE_PCT / 100);

  const proposedDailySpend = currentSpendDaily * scaleFactor;
  const proposedRevenue = hillFn(proposedDailySpend);

  // Expected incremental = revenue delta * lift fraction * days
  const expectedIncrementalRevenue =
    (proposedRevenue - currentRevenue) * liftMean * 7 * DEFAULT_DURATION_WEEKS;

  const budgetIncreasePct = Math.round((scaleFactor - 1) * 100);

  return {
    budgetIncreasePct,
    proposedDailySpend: Math.round(proposedDailySpend * 100) / 100,
    durationWeeks: DEFAULT_DURATION_WEEKS,
    expectedIncrementalRevenue: Math.max(0, Math.round(expectedIncrementalRevenue)),
  };
}

// ---------------------------------------------------------------------------
// classifyRecommendation
// ---------------------------------------------------------------------------

/**
 * Classify a campaign's recommendation action and confidence level.
 * Returns partial Recommendation fields — caller merges with campaign identity info.
 */
export function classifyRecommendation(
  score: ScoreRow,
  saturation: SaturationRow | null,
  currentDailySpend: number,
): Pick<
  Recommendation,
  | 'action'
  | 'confidenceLevel'
  | 'budgetIncreasePct'
  | 'currentDailySpend'
  | 'proposedDailySpend'
  | 'durationWeeks'
  | 'expectedIncrementalRevenue'
  | 'liftMean'
  | 'liftLower'
  | 'liftUpper'
  | 'confidence'
  | 'saturationPct'
  | 'nextAnalysisDate'
  | 'holdoutTestDesign'
  | 'expectedImpact'
> {
  // Case 1: No data yet
  if (score.status === 'insufficient_data' || score.status === 'error') {
    return {
      action: 'investigate',
      confidenceLevel: 'insufficient',
      expectedImpact: 0,
    };
  }

  const confidence = score.confidence ? parseFloat(score.confidence) : 0;
  const liftMean = score.liftMean ? parseFloat(score.liftMean) : null;
  const liftLower = score.liftLower ? parseFloat(score.liftLower) : undefined;
  const liftUpper = score.liftUpper ? parseFloat(score.liftUpper) : undefined;

  // Case 2: Low confidence — watch path with holdout test as secondary option (RECC-06)
  if (confidence < SCALE_UP_CONFIDENCE_THRESHOLD) {
    const confidenceLevel: RecommendationConfidenceLevel =
      score.status === 'pooled_estimate' ? 'low' : 'medium';

    const nextAnalysisDate = formatISO(addDays(new Date(), 7), { representation: 'date' });

    // Holdout test design — only computed here (low confidence path)
    // RECC-06: This field is intentionally absent on scale_up recommendations
    const holdoutTestDesign: HoldoutTestDesign = {
      holdbackPct: 10,
      durationWeeks: 2,
      // Rough sample size proxy: daily spend * 14 days * 100 (impressions/dollar estimate)
      estimatedSampleSize: Math.round(currentDailySpend * 14 * 100),
      description: 'Hold back 10% of spend for 2 weeks to measure incrementality directly',
    };

    return {
      action: 'watch',
      confidenceLevel,
      liftMean: liftMean ?? undefined,
      liftLower,
      liftUpper,
      confidence,
      nextAnalysisDate,
      holdoutTestDesign,
      // Impact is confidence * current spend (proxy for future value when we have more data)
      expectedImpact: confidence * currentDailySpend * 7,
    };
  }

  // Case 3: High confidence — scale_up path
  const confidenceLevel: RecommendationConfidenceLevel = confidence >= 0.85 ? 'high' : 'medium';

  // Pitfall 4: If saturation is NULL (not estimated), use lift-based estimate only
  if (
    !saturation ||
    saturation.status !== 'estimated' ||
    !saturation.saturationPct ||
    !saturation.hillAlpha ||
    !saturation.hillMu ||
    !saturation.hillGamma
  ) {
    // No Hill curve data — still recommend scale-up but without specific budget numbers
    const expectedImpact = liftMean
      ? liftMean * currentDailySpend * 7 * DEFAULT_DURATION_WEEKS
      : confidence * currentDailySpend * 7;

    return {
      action: 'scale_up',
      confidenceLevel,
      liftMean: liftMean ?? undefined,
      liftLower,
      liftUpper,
      confidence,
      expectedImpact: Math.round(expectedImpact),
    };
  }

  // Case 3b: High confidence + Hill curve available — full scale-up with specific numbers
  const saturationPct = parseFloat(saturation.saturationPct);
  const hillAlpha = parseFloat(saturation.hillAlpha);
  const hillMu = parseFloat(saturation.hillMu);
  const hillGamma = parseFloat(saturation.hillGamma);

  const budgetRec = computeBudgetRecommendation(
    currentDailySpend,
    hillAlpha,
    hillMu,
    hillGamma,
    saturationPct,
    liftMean ?? confidence, // fall back to confidence if liftMean is null
  );

  if (!budgetRec) {
    // Saturated — watch instead
    return {
      action: 'watch',
      confidenceLevel,
      liftMean: liftMean ?? undefined,
      liftLower,
      liftUpper,
      confidence,
      saturationPct,
      expectedImpact: 0,
    };
  }

  return {
    action: 'scale_up',
    confidenceLevel,
    budgetIncreasePct: budgetRec.budgetIncreasePct,
    currentDailySpend,
    proposedDailySpend: budgetRec.proposedDailySpend,
    durationWeeks: budgetRec.durationWeeks,
    expectedIncrementalRevenue: budgetRec.expectedIncrementalRevenue,
    liftMean: liftMean ?? undefined,
    liftLower,
    liftUpper,
    confidence,
    saturationPct,
    expectedImpact: budgetRec.expectedIncrementalRevenue,
  };
}

// ---------------------------------------------------------------------------
// generateRecommendations
// ---------------------------------------------------------------------------

/**
 * Main entry point — generates typed Recommendation[] for all campaigns
 * belonging to the given tenant.
 *
 * Algorithm:
 * 1. Query latest adjusted incrementality score per campaign (DISTINCT ON campaign)
 * 2. Filter OUT rollup sentinel rows via INNER JOIN campaigns — Pitfall 3
 * 3. LEFT JOIN saturation_estimates for Hill curve parameters
 * 4. LEFT JOIN campaigns for name and platform
 * 5. Compute 30-day average daily spend from campaign_metrics
 * 6. Classify each campaign and compute budget recommendation
 * 7. Merge seasonal alerts
 * 8. Sort by expectedImpact DESC (highest incremental revenue first per user decision)
 */
export async function generateRecommendations(
  tenantId: string,
  marketId?: string | null,
): Promise<Recommendation[]> {
  // Step 1 & 2: Get latest adjusted score per campaign, excluding rollup sentinel rows.
  // CRITICAL: INNER JOIN campaigns filters out rollup sentinel rows.
  // Rollup rows have pseudo-UUIDs that don't exist in the campaigns table — Pitfall 3.
  const latestScores: ScoreRow[] = await withTenant(tenantId, async (tx) => {
    const query = tx
      .select({
        campaignId: incrementalityScores.campaignId,
        status: incrementalityScores.status,
        liftMean: incrementalityScores.liftMean,
        liftLower: incrementalityScores.liftLower,
        liftUpper: incrementalityScores.liftUpper,
        confidence: incrementalityScores.confidence,
      })
      .from(incrementalityScores)
      .innerJoin(
        campaigns,
        and(
          eq(incrementalityScores.campaignId, campaigns.id),
          eq(campaigns.tenantId, tenantId),
        ),
      );

    // Market filter: INNER JOIN campaign_markets when marketId specified
    if (marketId) {
      query.innerJoin(
        campaignMarkets,
        and(
          eq(campaignMarkets.campaignId, incrementalityScores.campaignId),
          eq(campaignMarkets.marketId, marketId),
        ),
      );
    }

    return query
      .where(
        and(
          eq(incrementalityScores.tenantId, tenantId),
          eq(incrementalityScores.scoreType, 'adjusted'),
        ),
      )
      .orderBy(desc(incrementalityScores.scoredAt));
  });

  // Deduplicate to latest score per campaign
  const seenCampaigns = new Set<string>();
  const uniqueScores = latestScores.filter((s: ScoreRow) => {
    if (seenCampaigns.has(s.campaignId)) return false;
    seenCampaigns.add(s.campaignId);
    return true;
  });

  if (uniqueScores.length === 0) {
    return [];
  }

  const campaignIds = uniqueScores.map((s: ScoreRow) => s.campaignId);

  // Step 3: Get latest saturation estimate per campaign
  const latestSaturations: SaturationRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        campaignId: saturationEstimates.campaignId,
        saturationPct: saturationEstimates.saturationPct,
        hillAlpha: saturationEstimates.hillAlpha,
        hillMu: saturationEstimates.hillMu,
        hillGamma: saturationEstimates.hillGamma,
        status: saturationEstimates.status,
      })
      .from(saturationEstimates)
      .where(
        and(
          eq(saturationEstimates.tenantId, tenantId),
          sql`${saturationEstimates.campaignId} = ANY(ARRAY[${sql.join(
            campaignIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .orderBy(desc(saturationEstimates.estimatedAt));
  });

  // Deduplicate to latest saturation per campaign
  const seenSaturations = new Set<string>();
  const saturationByCampaign = new Map<string, SaturationRow>();
  for (const sat of latestSaturations) {
    if (!seenSaturations.has(sat.campaignId)) {
      seenSaturations.add(sat.campaignId);
      saturationByCampaign.set(sat.campaignId, sat);
    }
  }

  // Step 4: Get campaign name and platform
  const campaignRows: CampaignRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: campaigns.id,
        name: campaigns.name,
        source: campaigns.source,
        funnelStage: campaigns.funnelStage,
      })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.tenantId, tenantId),
          sql`${campaigns.id} = ANY(ARRAY[${sql.join(
            campaignIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      );
  });

  const campaignById = new Map<string, CampaignRow>(
    campaignRows.map((c: CampaignRow) => [c.id, c]),
  );

  // Step 5: Compute 30-day average daily spend from campaign_metrics
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const spendRows: Array<{ campaignId: string; avgDailySpend: string | null }> =
    await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          campaignId: campaignMetrics.campaignId,
          avgDailySpend: avg(campaignMetrics.spendUsd).as('avg_daily_spend'),
        })
        .from(campaignMetrics)
        .where(
          and(
            eq(campaignMetrics.tenantId, tenantId),
            sql`${campaignMetrics.date} >= ${thirtyDaysAgoStr}`,
            sql`${campaignMetrics.campaignId} = ANY(ARRAY[${sql.join(
              campaignIds.map((id: string) => sql`${id}::uuid`),
              sql`, `,
            )}])`,
          ),
        )
        .groupBy(campaignMetrics.campaignId);
    });

  const spendByCampaign = new Map<string, number>(
    spendRows.map((r: { campaignId: string; avgDailySpend: string | null }) => [
      r.campaignId,
      parseFloat(r.avgDailySpend ?? '0'),
    ]),
  );

  // Step 6: Classify each campaign
  const recommendations: Recommendation[] = [];

  for (const score of uniqueScores) {
    const campaign = campaignById.get(score.campaignId);
    if (!campaign) continue; // should not happen (inner join above), but guard anyway

    const saturation = saturationByCampaign.get(score.campaignId) ?? null;
    const currentDailySpend = spendByCampaign.get(score.campaignId) ?? 0;

    const classification = classifyRecommendation(score, saturation, currentDailySpend);

    recommendations.push({
      id: `rec-${score.campaignId}`,
      campaignId: score.campaignId,
      campaignName: campaign.name,
      platform: campaign.source,
      ...classification,
    });
  }

  // Step 7: Merge seasonal alerts
  try {
    const seasonalAlerts = await getUpcomingSeasonalAlerts(tenantId);
    // Attach alerts to top recommendation as the most prominent placement
    if (seasonalAlerts.length > 0 && recommendations.length > 0) {
      recommendations[0].seasonalAlert = seasonalAlerts[0];
    }
  } catch {
    // Seasonal alerts are non-critical — don't fail the whole request
  }

  // Step 8: Sort by expectedImpact DESC
  recommendations.sort(
    (a: Recommendation, b: Recommendation) => b.expectedImpact - a.expectedImpact,
  );

  return recommendations;
}
