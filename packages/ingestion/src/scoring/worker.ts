/**
 * Scoring worker — BullMQ job handler for campaign scoring jobs.
 *
 * Orchestrates the full scoring pipeline for a single campaign:
 *   1. Fetch campaign metrics from DB
 *   2. Check minimum data threshold (30 data points)
 *   3. Auto-assign funnel stage if not set
 *   4. Query tenant-specific seasonal events and convert to HolidayEvent format
 *   5. Call POST /forecast → baseline forecast (Prophet)
 *   6. Call POST /incrementality → adjusted + raw incrementality scores (CausalPy ITS)
 *   6b. Handle hierarchical pooling for borderline campaigns
 *   7. Call POST /saturation → Hill curve saturation estimate
 *   8. Call POST /anomalies → anomaly records
 *   9. Persist all results via persistScores()
 *  10. Update campaign_metrics modeled_* columns
 *
 * Python sidecar errors:
 *   - Network failure / non-200: let BullMQ handle retries (re-throw)
 *   - Domain error (insufficient_data, insufficient_variation): persist status, don't fail job
 *
 * Job timeout: 10 minutes per campaign (heavy Bayesian model fitting).
 */

import type { Job } from 'bullmq';
import { sql, and, eq } from 'drizzle-orm';
import {
  db,
  withTenant,
  campaignMetrics,
  incrementalityScores,
  seasonalEvents,
  campaignMarkets,
  tenants,
} from '@incremental-iq/db';
import { assignFunnelStage } from './funnel-stage';
import { persistScores } from './persist';
import type { ScoringResults } from './persist';
import type { ScoringJobData } from './dispatch';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ANALYSIS_SERVICE_URL =
  process.env.ANALYSIS_SERVICE_URL ?? 'http://localhost:8000';

/** Minimum data points required for individual campaign scoring. */
const MIN_DATA_POINTS = 30;

// ---------------------------------------------------------------------------
// Python sidecar types
// ---------------------------------------------------------------------------

/** A single daily metric row passed to the Python sidecar. */
interface MetricRow {
  date: string;
  spend_usd: number;
  impressions: number | null;
  clicks: number | null;
  direct_revenue: number | null;
  direct_conversions: number | null;
}

/** Holiday/event entry for Prophet's holiday regressor. */
interface HolidayEvent {
  name: string;
  date: string;
  lower_window: number;
  upper_window: number;
}

/** Request body for /forecast endpoint. */
interface ForecastRequest {
  tenant_id: string;
  campaign_id: string;
  metrics: MetricRow[];
  user_events: HolidayEvent[];
}

/** Request body for /incrementality endpoint. */
interface IncrementalityRequest {
  tenant_id: string;
  campaign_id: string;
  metrics: MetricRow[];
  intervention_date: string;
  user_events: HolidayEvent[];
}

/** Request body for /incrementality/pooled endpoint. */
interface PooledRequest {
  tenant_id: string;
  cluster_key: string;
  target_campaign_id: string;
  campaigns: Array<{
    campaign_id: string;
    metrics: MetricRow[];
    intervention_date: string;
    is_target: boolean; // true = borderline campaign needing pooled estimate
  }>;
}

/** Request body for /saturation endpoint. */
interface SaturationRequest {
  tenant_id: string;
  campaign_id: string;
  metrics: MetricRow[];
}

/** Request body for /anomalies endpoint. */
interface AnomalyRequest {
  tenant_id: string;
  campaign_id: string;
  metrics: MetricRow[];
}

// ---------------------------------------------------------------------------
// Helper: call Python sidecar
// ---------------------------------------------------------------------------

/**
 * Call a Python FastAPI endpoint and return the parsed JSON response.
 *
 * Throws on network failure or non-200 responses — BullMQ will handle retries.
 * Domain errors (status fields in response body) are returned normally.
 */
async function callSidecar<T>(endpoint: string, body: unknown): Promise<T> {
  const url = `${ANALYSIS_SERVICE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9 * 60 * 1000), // 9-minute timeout (job TTL is 10min)
  });

  if (!response.ok) {
    throw new Error(
      `Sidecar ${endpoint} returned HTTP ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Main job handler
// ---------------------------------------------------------------------------

/**
 * Process a single campaign scoring job.
 *
 * Called by the BullMQ scoring worker for 'score-campaign' jobs.
 * For 'score-all-campaigns' jobs, see workers.ts which routes to enqueueFullTenantScoring.
 *
 * @param job - BullMQ job with ScoringJobData payload.
 */
export async function processScoringJob(job: Job<ScoringJobData>): Promise<void> {
  const { tenantId, campaignId, triggerType, budgetChangeDate } = job.data;

  console.info(
    `[scoring-worker] Starting score: tenant=${tenantId} campaign=${campaignId} trigger=${triggerType}`,
  );

  await job.updateProgress(5);

  // -------------------------------------------------------------------------
  // Step 1: Fetch campaign metrics from DB
  // -------------------------------------------------------------------------
  const rawMetrics = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT
        date::text AS date,
        spend_usd::float AS spend_usd,
        impressions::float AS impressions,
        clicks::float AS clicks,
        direct_revenue::float AS direct_revenue,
        direct_conversions::float AS direct_conversions
      FROM campaign_metrics
      WHERE
        tenant_id = ${tenantId}::uuid
        AND campaign_id = ${campaignId}::uuid
        AND spend_usd IS NOT NULL
      ORDER BY date ASC
    `);
    return result.rows as MetricRow[];
  });

  await job.updateProgress(10);

  // -------------------------------------------------------------------------
  // Step 1b: Query campaign market assignment and tenant outcome mode
  // -------------------------------------------------------------------------
  const campaignMarket = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT market_id::text AS market_id
      FROM campaign_markets
      WHERE
        tenant_id = ${tenantId}::uuid
        AND campaign_id = ${campaignId}::uuid
      LIMIT 1
    `);
    return (result.rows[0] as { market_id: string | null } | undefined)?.market_id ?? null;
  });

  const tenantOutcomeMode = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT outcome_mode FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
    `);
    return (result.rows[0] as { outcome_mode: string } | undefined)?.outcome_mode ?? 'ecommerce';
  });

  // For lead-gen tenants, use directConversions as the revenue field in MetricRow
  if (tenantOutcomeMode === 'lead_gen') {
    for (const row of rawMetrics) {
      row.direct_revenue = row.direct_conversions;
    }
  }

  await job.updateProgress(15);

  // -------------------------------------------------------------------------
  // Step 2: Check minimum data threshold
  // -------------------------------------------------------------------------
  const dataPoints = rawMetrics.length;

  if (dataPoints < MIN_DATA_POINTS) {
    // Check if this campaign belongs to a cluster with scored peers
    const clusterPeers = await _getClusterPeers(tenantId, campaignId);

    if (clusterPeers.length < 2) {
      // No cluster context — truly insufficient data
      console.info(
        `[scoring-worker] Insufficient data (${dataPoints} points, no cluster peers) for campaign ${campaignId}`,
      );
      await _persistInsufficientData(tenantId, campaignId, dataPoints);
      await job.updateProgress(100);
      return;
    }

    // Has cluster peers — flag for hierarchical pooling (handled in batch step 5b)
    // For now, we can still proceed to get user_events and other setup,
    // but we'll use the pooled endpoint instead of individual incrementality.
    console.info(
      `[scoring-worker] Borderline data (${dataPoints} points), ${clusterPeers.length} cluster peers — will use hierarchical pooling`,
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Auto-assign funnel stage if not set
  // -------------------------------------------------------------------------
  await assignFunnelStage(tenantId, campaignId);

  await job.updateProgress(20);

  // -------------------------------------------------------------------------
  // Step 3b: Query tenant-specific seasonal events
  //
  // Only query user-defined brand events (is_user_defined = true) for this tenant.
  // System events (tenant_id IS NULL) are loaded from retail_calendar.py
  // in the Python model itself — no need to pass them here.
  // -------------------------------------------------------------------------
  const userEvents = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT
        name,
        event_date::text AS event_date,
        window_before::integer AS window_before,
        window_after::integer AS window_after
      FROM seasonal_events
      WHERE
        tenant_id = ${tenantId}::uuid
        AND is_user_defined = true
      ORDER BY event_date ASC
    `);
    return result.rows as Array<{
      name: string;
      event_date: string;
      window_before: number;
      window_after: number;
    }>;
  });

  // Convert to HolidayEvent format (Prophet convention: lower_window must be <= 0)
  const holidayEvents: HolidayEvent[] = userEvents.map((e) => ({
    name: e.name,
    date: e.event_date,
    lower_window: -(e.window_before), // positive int in DB → negative for Prophet
    upper_window: e.window_after,
  }));

  await job.updateProgress(25);

  // -------------------------------------------------------------------------
  // Step 4: Call POST /forecast (baseline Prophet model)
  // -------------------------------------------------------------------------
  const forecastRequest: ForecastRequest = {
    tenant_id: tenantId,
    campaign_id: campaignId,
    metrics: rawMetrics,
    user_events: holidayEvents,
  };

  try {
    await callSidecar('/forecast', forecastRequest);
    // Forecast is used internally by the Python model — we don't persist it directly.
    // It's a prerequisite for the incrementality model.
  } catch (err) {
    console.warn(`[scoring-worker] /forecast failed for campaign ${campaignId}: ${err}`);
    // Forecast failure is non-fatal; incrementality endpoint has its own Prophet fitting.
  }

  await job.updateProgress(40);

  // -------------------------------------------------------------------------
  // Step 5: Determine intervention date for ITS model
  //
  // Use campaign start date or the most recent budget change date.
  // For simplicity, use the date of first non-zero spend as campaign start.
  // -------------------------------------------------------------------------
  const interventionDate = _getInterventionDate(rawMetrics, triggerType, budgetChangeDate);

  // -------------------------------------------------------------------------
  // Step 5: Call POST /incrementality (CausalPy ITS dual scores)
  // -------------------------------------------------------------------------
  let incrementalityResult: ScoringResults['incrementality'];

  if (dataPoints >= MIN_DATA_POINTS) {
    // Individual scoring path
    const incrementalityRequest: IncrementalityRequest = {
      tenant_id: tenantId,
      campaign_id: campaignId,
      metrics: rawMetrics,
      intervention_date: interventionDate,
      user_events: holidayEvents,
    };

    const itResponse = await callSidecar<{
      adjusted: ScoringResults['incrementality']['adjusted'];
      raw: ScoringResults['incrementality']['raw'];
      raw_model_output?: unknown;
    }>('/incrementality', incrementalityRequest);

    incrementalityResult = itResponse;
  } else {
    // -----------------------------------------------------------------------
    // Step 5b: Hierarchical pooling for borderline campaigns
    // -----------------------------------------------------------------------
    const clusterPeers = await _getClusterPeers(tenantId, campaignId);
    const pooledResult = await _runHierarchicalPooling(
      tenantId,
      campaignId,
      rawMetrics,
      interventionDate,
      holidayEvents,
      clusterPeers,
    );

    incrementalityResult = {
      adjusted: {
        lift_mean: pooledResult.adjusted.lift_mean,
        lift_lower: pooledResult.adjusted.lift_lower,
        lift_upper: pooledResult.adjusted.lift_upper,
        confidence: pooledResult.adjusted.confidence,
        data_points: dataPoints,
        status: 'pooled_estimate',
      },
      raw: {
        lift_mean: pooledResult.raw.lift_mean,
        lift_lower: pooledResult.raw.lift_lower,
        lift_upper: pooledResult.raw.lift_upper,
        confidence: pooledResult.raw.confidence,
        data_points: dataPoints,
        status: 'pooled_estimate',
      },
    };
  }

  await job.updateProgress(65);

  // -------------------------------------------------------------------------
  // Step 6: Call POST /saturation (Hill curve fitting)
  // -------------------------------------------------------------------------
  const saturationRequest: SaturationRequest = {
    tenant_id: tenantId,
    campaign_id: campaignId,
    metrics: rawMetrics,
  };

  const saturationResponse = await callSidecar<{
    saturation_pct: number | null;
    hill_alpha: number | null;
    hill_mu: number | null;
    hill_gamma: number | null;
    status: 'estimated' | 'insufficient_variation' | 'error';
  }>('/saturation', saturationRequest);

  await job.updateProgress(80);

  // -------------------------------------------------------------------------
  // Step 7: Call POST /anomalies (STL anomaly detection)
  // -------------------------------------------------------------------------
  const anomalyRequest: AnomalyRequest = {
    tenant_id: tenantId,
    campaign_id: campaignId,
    metrics: rawMetrics,
  };

  const anomalyResponse = await callSidecar<{
    anomalies: Array<{
      date: string;
      metric: string;
      zscore: number;
      direction: 'up' | 'down';
    }>;
  }>('/anomalies', anomalyRequest);

  await job.updateProgress(90);

  // -------------------------------------------------------------------------
  // Step 8: Persist all results
  // -------------------------------------------------------------------------
  const scoringResults: ScoringResults = {
    incrementality: incrementalityResult,
    saturation: {
      saturation_pct: saturationResponse.saturation_pct,
      hill_alpha: saturationResponse.hill_alpha,
      hill_mu: saturationResponse.hill_mu,
      hill_gamma: saturationResponse.hill_gamma,
      status: saturationResponse.status,
    },
    anomalies: {
      anomalies: anomalyResponse.anomalies,
    },
  };

  await persistScores(tenantId, campaignId, scoringResults, campaignMarket);

  await job.updateProgress(100);

  console.info(
    `[scoring-worker] Completed score: tenant=${tenantId} campaign=${campaignId} market=${campaignMarket ?? 'global'} status=${incrementalityResult.adjusted.status}`,
  );
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Write an insufficient_data status record to incrementality_scores.
 *
 * Used when a campaign has < 30 data points and no cluster peers.
 */
async function _persistInsufficientData(
  tenantId: string,
  campaignId: string,
  dataPoints: number,
): Promise<void> {
  await withTenant(tenantId, async () => {
    const scoredAt = new Date();

    // Insert both adjusted and raw as insufficient_data
    for (const scoreType of ['adjusted', 'raw'] as const) {
      await db.insert(incrementalityScores).values({
        tenantId,
        campaignId,
        scoredAt,
        scoreType,
        liftMean: null,
        liftLower: null,
        liftUpper: null,
        confidence: null,
        dataPoints: String(dataPoints),
        status: 'insufficient_data',
        rawModelOutput: null,
        marketId: null,
      });
    }
  });
}

/**
 * Get cluster peers for a campaign (same platform + funnel stage).
 *
 * Returns scored campaign IDs in the same cluster, along with their
 * latest lift estimates for the hierarchical pooling request.
 */
async function _getClusterPeers(
  tenantId: string,
  campaignId: string,
): Promise<Array<{ campaign_id: string; lift_mean: number }>> {
  return withTenant(tenantId, async () => {
    // Find the platform and funnel stage of the target campaign
    const result = await db.execute(sql`
      WITH target AS (
        SELECT source, funnel_stage
        FROM campaigns
        WHERE tenant_id = ${tenantId}::uuid
          AND id = ${campaignId}::uuid
      ),
      peers AS (
        SELECT DISTINCT c.id::text AS campaign_id
        FROM campaigns c
        JOIN target t ON c.source = t.source AND c.funnel_stage = t.funnel_stage
        WHERE c.tenant_id = ${tenantId}::uuid
          AND c.id != ${campaignId}::uuid
      )
      SELECT
        p.campaign_id,
        COALESCE(s.lift_mean::float, 0) AS lift_mean
      FROM peers p
      LEFT JOIN LATERAL (
        SELECT lift_mean
        FROM incrementality_scores
        WHERE tenant_id = ${tenantId}::uuid
          AND campaign_id = p.campaign_id::uuid
          AND score_type = 'adjusted'
          AND status = 'scored'
        ORDER BY scored_at DESC
        LIMIT 1
      ) s ON true
      WHERE s.lift_mean IS NOT NULL
    `);

    return result.rows as Array<{ campaign_id: string; lift_mean: number }>;
  });
}

/**
 * Run hierarchical pooling for a borderline campaign.
 *
 * Calls POST /incrementality/pooled with the borderline campaign and its
 * scored cluster peers. The pooled endpoint borrows strength from the
 * cluster to produce an estimate with widened credible intervals.
 *
 * Per user decision: "marketers always get a directional signal" — pooled
 * estimates provide cluster-informed estimates for borderline campaigns.
 */
async function _runHierarchicalPooling(
  tenantId: string,
  campaignId: string,
  metrics: MetricRow[],
  interventionDate: string,
  userEvents: HolidayEvent[],
  peers: Array<{ campaign_id: string; lift_mean: number }>,
): Promise<{
  adjusted: {
    lift_mean: number;
    lift_lower: number;
    lift_upper: number;
    confidence: number;
  };
  raw: {
    lift_mean: number;
    lift_lower: number;
    lift_upper: number;
    confidence: number;
  };
}> {
  // Fetch peer metrics
  const peerCampaigns = await Promise.all(
    peers.map(async (peer) => {
      const peerMetrics = await withTenant(tenantId, async () => {
        const result = await db.execute(sql`
          SELECT
            date::text AS date,
            spend_usd::float AS spend_usd,
            impressions::float AS impressions,
            clicks::float AS clicks,
            direct_revenue::float AS direct_revenue,
            direct_conversions::float AS direct_conversions
          FROM campaign_metrics
          WHERE
            tenant_id = ${tenantId}::uuid
            AND campaign_id = ${peer.campaign_id}::uuid
            AND spend_usd IS NOT NULL
          ORDER BY date ASC
        `);
        return result.rows as MetricRow[];
      });

      return {
        campaign_id: peer.campaign_id,
        metrics: peerMetrics,
        intervention_date: interventionDate,
        is_target: false,
      };
    }),
  );

  const pooledRequest: PooledRequest = {
    tenant_id: tenantId,
    cluster_key: `pooled_${campaignId}`,
    target_campaign_id: campaignId,
    campaigns: [
      ...peerCampaigns,
      {
        campaign_id: campaignId,
        metrics,
        intervention_date: interventionDate,
        is_target: true,
      },
    ],
  };

  const pooledResponse = await callSidecar<{
    adjusted: {
      campaign_id: string;
      lift_mean: number;
      lift_lower: number;
      lift_upper: number;
      confidence: number;
      status: string;
      [key: string]: unknown;
    };
    raw: {
      campaign_id: string;
      lift_mean: number;
      lift_lower: number;
      lift_upper: number;
      confidence: number;
      status: string;
      [key: string]: unknown;
    };
    all_results: unknown[];
  }>('/incrementality/pooled', pooledRequest);

  return {
    adjusted: {
      lift_mean: pooledResponse.adjusted.lift_mean,
      lift_lower: pooledResponse.adjusted.lift_lower,
      lift_upper: pooledResponse.adjusted.lift_upper,
      confidence: pooledResponse.adjusted.confidence,
    },
    raw: {
      lift_mean: pooledResponse.raw.lift_mean,
      lift_lower: pooledResponse.raw.lift_lower,
      lift_upper: pooledResponse.raw.lift_upper,
      confidence: pooledResponse.raw.confidence,
    },
  };
}

/**
 * Determine the ITS intervention date for a campaign.
 *
 * For budget_change triggered jobs, uses the actual budget change date (midpoint
 * of the transition window computed by detectBudgetChanges). This ensures the
 * counterfactual baseline is computed from the correct intervention point.
 *
 * For other trigger types, falls back to the date of first non-zero spend.
 */
function _getInterventionDate(
  metrics: MetricRow[],
  triggerType: string,
  budgetChangeDate?: string,
): string {
  // For budget-change triggered scoring, use the actual change date
  if (triggerType === 'budget_change' && budgetChangeDate) {
    return budgetChangeDate; // Midpoint already computed by detectBudgetChanges
  }

  // Find first date with non-zero spend (campaign start date)
  const firstSpend = metrics.find((m) => m.spend_usd > 0);
  if (firstSpend) {
    return firstSpend.date;
  }

  // Fallback: midpoint of available data
  if (metrics.length > 0) {
    const midIdx = Math.floor(metrics.length / 2);
    return metrics[midIdx].date;
  }

  // Last resort: 30 days ago
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}
