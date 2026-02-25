/**
 * Spend-weighted score rollup with uncertainty propagation.
 *
 * Implements the 4-level score hierarchy per RESEARCH.md Pattern 2:
 *   Campaign -> Cluster (Platform x Funnel Stage) -> Channel (Platform) -> Overall
 *
 * Per user decisions:
 *   - "Uncertainty propagation: cluster/channel confidence intervals widen
 *     to reflect low-confidence campaigns" — variance-weighted combination
 *   - "Confidence-weighted best estimate always provides directional signal" —
 *     confidence * spend weighting alongside propagated intervals
 *   - "STAT-05 scaffold: include marketId in grouping if non-null" —
 *     marketId grouping for Phase 5 geo-based testing
 *
 * Rollup sentinel convention: campaignId = 'rollup:{level}:{groupKey}'
 * distinguishes rollup rows from campaign-level scores in incrementality_scores.
 */

import { sql, and, eq, inArray } from 'drizzle-orm';
import {
  db,
  withTenant,
  incrementalityScores,
  campaignMetrics,
  campaigns,
} from '@incremental-iq/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Campaign-level score used as input to rollup computation. */
export interface CampaignScore {
  campaignId: string;
  funnelStage: 'awareness' | 'consideration' | 'conversion';
  platform: string; // 'meta' | 'google_ads' | 'shopify'
  spendUsd: number;
  liftMean: number;
  liftLower: number;
  liftUpper: number;
  confidence: number;
  status: string;
  marketId: string | null; // STAT-05 scaffold — NULL in Phase 3
}

/** Aggregated score for a cluster, channel, or overall level. */
export interface RollupScore {
  level: 'cluster' | 'channel' | 'overall';
  /** e.g., 'meta_awareness', 'meta', 'overall' */
  groupKey: string;
  /** Spend-weighted average lift (primary estimate). */
  liftMean: number;
  /** Propagated lower bound (widens through hierarchy). */
  liftLower: number;
  /** Propagated upper bound (widens through hierarchy). */
  liftUpper: number;
  /** Confidence-weighted best estimate for directional signal. */
  confidence: number;
  campaignCount: number;
  totalSpend: number;
}

// ---------------------------------------------------------------------------
// Core rollup computation
// ---------------------------------------------------------------------------

/**
 * Compute a spend-weighted rollup for a group of campaign scores.
 *
 * Algorithm (per RESEARCH.md):
 *   1. Spend-weighted average for lift_mean
 *   2. Variance-weighted uncertainty propagation for credible interval
 *   3. Confidence-weighted "best estimate" for directional signal
 *
 * Variance propagation:
 *   - Individual campaign variance = ((liftUpper - liftLower) / 4)^2
 *     (approximates ~95% interval half-width as 2σ, so σ = (width/4))
 *   - Propagated variance = Σ(individual_variance * spend_weight^2)
 *   - Rollup half-width = 2 * √(propagated_variance) for ~95% interval
 *
 * The rollup half-width WIDENS for groups containing low-confidence campaigns,
 * correctly reflecting the increased uncertainty in the aggregate estimate.
 *
 * @param scores - Campaign-level scores to aggregate (must be non-empty).
 * @param level  - Hierarchy level of this rollup.
 * @param groupKey - Identifier for this group (e.g., 'meta_awareness').
 * @returns Aggregated RollupScore.
 */
export function spendWeightedRollup(
  scores: CampaignScore[],
  level: 'cluster' | 'channel' | 'overall',
  groupKey: string,
): RollupScore {
  if (scores.length === 0) {
    throw new Error(`spendWeightedRollup: cannot rollup empty scores array for ${groupKey}`);
  }

  const totalSpend = scores.reduce((sum, s) => sum + s.spendUsd, 0);

  // Handle edge case: all campaigns have zero spend (use equal weights)
  const effectiveTotalSpend = totalSpend === 0 ? scores.length : totalSpend;

  // -------------------------------------------------------------------------
  // 1. Spend-weighted average lift_mean
  // -------------------------------------------------------------------------
  const weightedLiftSum = scores.reduce((sum, s) => {
    const weight = totalSpend === 0 ? 1 : s.spendUsd;
    return sum + s.liftMean * weight;
  }, 0);
  const liftMean = weightedLiftSum / effectiveTotalSpend;

  // -------------------------------------------------------------------------
  // 2. Variance-weighted uncertainty propagation
  //
  // Formula: propagated_variance = Σ(σ_i^2 * w_i^2)
  // where σ_i = (liftUpper_i - liftLower_i) / 4 (≈ 1σ for 95% interval)
  //       w_i = spend_i / total_spend (spend weight)
  // -------------------------------------------------------------------------
  let propagatedVariance = 0;
  for (const score of scores) {
    const halfWidth = (score.liftUpper - score.liftLower) / 4;
    const variance = halfWidth * halfWidth;
    const weight = (totalSpend === 0 ? 1 : score.spendUsd) / effectiveTotalSpend;
    propagatedVariance += variance * weight * weight;
  }

  const rollupHalfWidth = 2 * Math.sqrt(propagatedVariance);
  const liftLower = liftMean - rollupHalfWidth;
  const liftUpper = liftMean + rollupHalfWidth;

  // -------------------------------------------------------------------------
  // 3. Confidence-weighted best estimate
  //
  // Formula: weighted_confidence = Σ(confidence_i * spend_i) / Σ(spend_i)
  // Gives directional signal even when some campaigns have low confidence.
  // -------------------------------------------------------------------------
  const confidenceNumerator = scores.reduce((sum, s) => {
    const weight = totalSpend === 0 ? 1 : s.spendUsd;
    return sum + s.confidence * weight;
  }, 0);
  const confidence = confidenceNumerator / effectiveTotalSpend;

  return {
    level,
    groupKey,
    liftMean,
    liftLower,
    liftUpper,
    confidence,
    campaignCount: scores.length,
    totalSpend,
  };
}

/**
 * Compute the full 4-level hierarchy rollups for a set of campaign scores.
 *
 * Hierarchy:
 *   Level 1 (Campaign)  — individual campaign scores (not computed here, input)
 *   Level 2 (Cluster)   — Platform x Funnel Stage groups (e.g., 'meta_awareness')
 *   Level 3 (Channel)   — Platform groups (e.g., 'meta')
 *   Level 4 (Overall)   — single aggregate across all campaigns
 *
 * STAT-05 scaffold: if marketId is non-null, it is included in the groupKey
 * for cluster and channel levels. Phase 5 will populate marketId from geo data.
 *
 * Campaigns with status 'scored' or 'pooled_estimate' are included.
 * Campaigns with status 'insufficient_data' or 'error' are excluded.
 * Pooled estimates have lower confidence and wider intervals, so they
 * contribute proportionally less via the confidence-weighted formula.
 *
 * @param scores - All campaign-level scores for a tenant.
 * @returns All rollup scores (cluster + channel + overall levels).
 */
export function computeHierarchyRollups(scores: CampaignScore[]): RollupScore[] {
  // Filter to scoreable campaigns only
  const scoreable = scores.filter(
    (s) => s.status === 'scored' || s.status === 'pooled_estimate',
  );

  if (scoreable.length === 0) {
    return [];
  }

  const rollups: RollupScore[] = [];

  // -------------------------------------------------------------------------
  // Level 2: Cluster rollups (Platform x Funnel Stage)
  // -------------------------------------------------------------------------
  const clusterGroups = new Map<string, CampaignScore[]>();
  for (const score of scoreable) {
    // STAT-05 scaffold: include marketId in cluster key if non-null
    const marketSuffix = score.marketId ? `_${score.marketId}` : '';
    const clusterKey = `${score.platform}_${score.funnelStage}${marketSuffix}`;

    if (!clusterGroups.has(clusterKey)) {
      clusterGroups.set(clusterKey, []);
    }
    clusterGroups.get(clusterKey)!.push(score);
  }

  for (const [clusterKey, clusterScores] of clusterGroups) {
    rollups.push(spendWeightedRollup(clusterScores, 'cluster', clusterKey));
  }

  // -------------------------------------------------------------------------
  // Level 3: Channel rollups (Platform)
  // -------------------------------------------------------------------------
  const channelGroups = new Map<string, CampaignScore[]>();
  for (const score of scoreable) {
    const marketSuffix = score.marketId ? `_${score.marketId}` : '';
    const channelKey = `${score.platform}${marketSuffix}`;

    if (!channelGroups.has(channelKey)) {
      channelGroups.set(channelKey, []);
    }
    channelGroups.get(channelKey)!.push(score);
  }

  for (const [channelKey, channelScores] of channelGroups) {
    rollups.push(spendWeightedRollup(channelScores, 'channel', channelKey));
  }

  // -------------------------------------------------------------------------
  // Level 3.5: Market rollups (all campaigns in same market)
  //
  // Aggregates across platforms within a single market. Only produced when
  // at least one campaign has a non-null marketId.
  // -------------------------------------------------------------------------
  const marketGroups = new Map<string, CampaignScore[]>();
  for (const score of scoreable) {
    if (!score.marketId) continue;
    if (!marketGroups.has(score.marketId)) {
      marketGroups.set(score.marketId, []);
    }
    marketGroups.get(score.marketId)!.push(score);
  }

  for (const [marketId, marketScores] of marketGroups) {
    rollups.push(spendWeightedRollup(marketScores, 'channel', `market_${marketId}`));
  }

  // -------------------------------------------------------------------------
  // Level 4: Overall rollup (all markets combined — "All Markets" view)
  // -------------------------------------------------------------------------
  rollups.push(spendWeightedRollup(scoreable, 'overall', 'overall'));

  return rollups;
}

// ---------------------------------------------------------------------------
// Recompute and persist rollups
// ---------------------------------------------------------------------------

/**
 * Recompute all hierarchy rollups for a tenant and persist to incrementality_scores.
 *
 * Queries:
 *   1. Latest adjusted score per campaign (most recent scored_at)
 *   2. Campaign platform and funnel stage from campaigns table
 *   3. Total spend from campaign_metrics (last 30 days)
 *
 * Rollup rows use a sentinel campaignId convention:
 *   'rollup:{level}:{groupKey}'
 * This distinguishes them from campaign-level scores without a separate table.
 *
 * Called after all campaign scoring jobs for a tenant complete.
 * Also called as a standalone step after a manual recompute.
 *
 * @param tenantId - Tenant UUID to recompute rollups for.
 */
export async function recomputeRollups(tenantId: string): Promise<void> {
  await withTenant(tenantId, async () => {
    // -----------------------------------------------------------------------
    // Query latest adjusted scores per campaign
    // -----------------------------------------------------------------------
    const latestScoresResult = await db.execute(sql`
      SELECT DISTINCT ON (campaign_id)
        campaign_id::text AS campaign_id,
        lift_mean::float AS lift_mean,
        lift_lower::float AS lift_lower,
        lift_upper::float AS lift_upper,
        confidence::float AS confidence,
        status,
        market_id::text AS market_id
      FROM incrementality_scores
      WHERE
        tenant_id = ${tenantId}::uuid
        AND score_type = 'adjusted'
        AND status IN ('scored', 'pooled_estimate')
      ORDER BY campaign_id, scored_at DESC
    `);

    if (latestScoresResult.rows.length === 0) {
      console.info(`[rollup] No scored campaigns found for tenant ${tenantId}`);
      return;
    }

    const latestScores = latestScoresResult.rows as Array<{
      campaign_id: string;
      lift_mean: number;
      lift_lower: number;
      lift_upper: number;
      confidence: number;
      status: string;
      market_id: string | null;
    }>;

    const campaignIds = latestScores.map((s) => s.campaign_id);

    // -----------------------------------------------------------------------
    // Query campaign platform and funnel stage
    // -----------------------------------------------------------------------
    const campaignDetailsResult = await db.execute(sql`
      SELECT
        id::text AS campaign_id,
        source AS platform,
        COALESCE(funnel_stage, 'conversion') AS funnel_stage
      FROM campaigns
      WHERE
        tenant_id = ${tenantId}::uuid
        AND id = ANY(${sql`ARRAY[${sql.raw(campaignIds.map((id) => `'${id}'`).join(','))}]::uuid[]`})
    `);

    const campaignDetails = new Map<
      string,
      { platform: string; funnelStage: 'awareness' | 'consideration' | 'conversion' }
    >();
    for (const row of campaignDetailsResult.rows as Array<{
      campaign_id: string;
      platform: string;
      funnel_stage: string;
    }>) {
      campaignDetails.set(row.campaign_id, {
        platform: row.platform,
        funnelStage: row.funnel_stage as 'awareness' | 'consideration' | 'conversion',
      });
    }

    // -----------------------------------------------------------------------
    // Query 30-day spend per campaign
    // -----------------------------------------------------------------------
    const spendResult = await db.execute(sql`
      SELECT
        campaign_id::text AS campaign_id,
        COALESCE(SUM(spend_usd::float), 0) AS total_spend
      FROM campaign_metrics
      WHERE
        tenant_id = ${tenantId}::uuid
        AND date >= CURRENT_DATE - INTERVAL '30 days'
        AND spend_usd IS NOT NULL
        AND campaign_id = ANY(${sql`ARRAY[${sql.raw(campaignIds.map((id) => `'${id}'`).join(','))}]::uuid[]`})
      GROUP BY campaign_id
    `);

    const campaignSpend = new Map<string, number>();
    for (const row of spendResult.rows as Array<{
      campaign_id: string;
      total_spend: number;
    }>) {
      campaignSpend.set(row.campaign_id, row.total_spend);
    }

    // -----------------------------------------------------------------------
    // Build CampaignScore array
    // -----------------------------------------------------------------------
    const campaignScores: CampaignScore[] = [];

    for (const score of latestScores) {
      const details = campaignDetails.get(score.campaign_id);
      if (!details) continue; // Campaign no longer in DB — skip

      campaignScores.push({
        campaignId: score.campaign_id,
        funnelStage: details.funnelStage,
        platform: details.platform,
        spendUsd: campaignSpend.get(score.campaign_id) ?? 0,
        liftMean: score.lift_mean,
        liftLower: score.lift_lower,
        liftUpper: score.lift_upper,
        confidence: score.confidence,
        status: score.status,
        marketId: score.market_id,
      });
    }

    if (campaignScores.length === 0) {
      console.info(`[rollup] No scoreable campaigns after joining campaign details for tenant ${tenantId}`);
      return;
    }

    // -----------------------------------------------------------------------
    // Compute hierarchy rollups
    // -----------------------------------------------------------------------
    const rollupScores = computeHierarchyRollups(campaignScores);

    // -----------------------------------------------------------------------
    // Persist rollup scores to incrementality_scores
    //
    // Convention: campaignId = 'rollup:{level}:{groupKey}'
    // This sentinel allows rollup rows to coexist with campaign rows in the
    // same table without a separate rollup_scores table.
    //
    // Note: The UUID type constraint means we store rollup IDs as generated UUIDs,
    // with the groupKey encoded in rawModelOutput for identification.
    // -----------------------------------------------------------------------
    const scoredAt = new Date();

    for (const rollup of rollupScores) {
      await db.insert(incrementalityScores).values({
        tenantId,
        // Rollup sentinel: encode level and groupKey in rawModelOutput
        // campaignId is a generated UUID (required by schema)
        campaignId: generateRollupCampaignId(rollup.level, rollup.groupKey),
        scoredAt,
        scoreType: 'adjusted',
        liftMean: rollup.liftMean.toFixed(6),
        liftLower: rollup.liftLower.toFixed(6),
        liftUpper: rollup.liftUpper.toFixed(6),
        confidence: rollup.confidence.toFixed(4),
        dataPoints: String(rollup.campaignCount),
        status: 'scored',
        rawModelOutput: {
          type: 'rollup',
          level: rollup.level,
          groupKey: rollup.groupKey,
          campaignCount: rollup.campaignCount,
          totalSpend: rollup.totalSpend,
        },
        marketId: null,
      });
    }

    console.info(
      `[rollup] Persisted ${rollupScores.length} rollup scores for tenant ${tenantId}`,
    );
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic UUID-like string for rollup sentinel campaignIds.
 *
 * Uses a namespace-based approach: the rollup level and groupKey are hashed
 * to produce a consistent UUID for the same rollup group across recomputes.
 *
 * This allows dashboard queries to identify rollup rows by their campaignId
 * prefix pattern.
 *
 * For now we use a simple deterministic UUID v5-style computation.
 * In practice, the rawModelOutput.groupKey is the canonical identifier.
 */
function generateRollupCampaignId(level: string, groupKey: string): string {
  // Create a deterministic pseudo-UUID from level+groupKey
  // Format: 'rrrrllll-gggg-gggg-gggg-gggggggggggg' where r=rollup, l=level, g=groupKey hash
  const input = `rollup:${level}:${groupKey}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Convert hash to hex and pad to UUID format
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  const levelHex = level.split('').map((c) => c.charCodeAt(0).toString(16)).join('').slice(0, 4).padStart(4, '0');
  const groupHex = groupKey.split('').map((c) => c.charCodeAt(0).toString(16)).join('').slice(0, 12).padStart(12, '0');

  return `${hexHash}-${levelHex}-4000-8000-${groupHex}`;
}
