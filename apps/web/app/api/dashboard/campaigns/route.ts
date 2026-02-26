import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { withTenant, campaigns, campaignMetrics, incrementalityScores, campaignMarkets } from '@incremental-iq/db';
import { eq, and, desc, sql, sum } from 'drizzle-orm';

/**
 * GET /api/dashboard/campaigns
 *
 * Returns campaign-level or rollup-level data with incrementality scores
 * for the requested date range.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Query params:
 *   from     (required)  — ISO date string, e.g. "2025-01-01"
 *   to       (required)  — ISO date string, e.g. "2025-01-31"
 *   platform (optional)  — filter by platform/source (e.g., 'google_ads', 'meta')
 *   level    (optional)  — 'campaign' (default) | 'cluster' | 'channel' | 'overall'
 *
 * For level='campaign' (default):
 *   Returns individual campaigns with aggregated metrics + latest incrementality scores.
 *   CRITICAL: Rollup sentinel rows are excluded (they have no campaigns table entry).
 *
 * For level='cluster'|'channel'|'overall':
 *   Returns rollup rows from incrementality_scores with the matching level pattern.
 *   Rollup sentinel rows use groupKey in rawModelOutput to identify their level.
 *
 * Returns:
 *   200: CampaignRow[]
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 */

interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  funnelStage: string | null;
  spend: number;
  revenue: number;
  roas: number;
  liftMean: number | null;
  liftLower: number | null;
  liftUpper: number | null;
  confidence: number | null;
  status: string | null;
  isRollup: boolean;
}

interface CampaignListRow {
  id: string;
  name: string;
  source: string;
  funnelStage: string | null;
}

interface MetricsRow {
  campaignId: string;
  totalSpend: string | null;
  totalRevenue: string | null;
}

interface ScoreRow {
  campaignId: string;
  liftMean: string | null;
  liftLower: string | null;
  liftUpper: string | null;
  confidence: string | null;
  status: string;
}

interface RollupScoreRow {
  campaignId: string;
  liftMean: string | null;
  liftLower: string | null;
  liftUpper: string | null;
  confidence: string | null;
  status: string;
  rawModelOutput: unknown;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const platform = searchParams.get('platform');
  const level = searchParams.get('level') ?? 'campaign';
  const marketId = searchParams.get('marketId');

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Missing required query parameters: from, to' },
      { status: 400 },
    );
  }

  if (!['campaign', 'cluster', 'channel', 'overall'].includes(level)) {
    return NextResponse.json(
      { error: 'Invalid level parameter. Must be: campaign, cluster, channel, or overall' },
      { status: 400 },
    );
  }

  if (level !== 'campaign') {
    // Rollup level — read from incrementality_scores sentinel rows
    const rollupRows: RollupScoreRow[] = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          campaignId: incrementalityScores.campaignId,
          liftMean: incrementalityScores.liftMean,
          liftLower: incrementalityScores.liftLower,
          liftUpper: incrementalityScores.liftUpper,
          confidence: incrementalityScores.confidence,
          status: incrementalityScores.status,
          rawModelOutput: incrementalityScores.rawModelOutput,
        })
        .from(incrementalityScores)
        .where(
          and(
            eq(incrementalityScores.tenantId, tenantId),
            eq(incrementalityScores.scoreType, 'adjusted'),
            // Rollup convention: rawModelOutput contains { level: '...' }
            sql`${incrementalityScores.rawModelOutput}->>'level' = ${level}`,
          ),
        )
        .orderBy(desc(incrementalityScores.scoredAt));
    });

    // Deduplicate to latest per group key
    const seenGroups = new Set<string>();
    const result: CampaignRow[] = [];

    for (const row of rollupRows) {
      const output = row.rawModelOutput as Record<string, string> | null;
      const groupKey = output?.groupKey ?? row.campaignId;

      if (seenGroups.has(groupKey)) continue;
      seenGroups.add(groupKey);

      result.push({
        id: row.campaignId,
        name: output?.groupKey ?? `${level} rollup`,
        platform: output?.platform ?? 'all',
        funnelStage: output?.funnelStage ?? null,
        spend: 0,
        revenue: 0,
        roas: 0,
        liftMean: row.liftMean ? parseFloat(row.liftMean) : null,
        liftLower: row.liftLower ? parseFloat(row.liftLower) : null,
        liftUpper: row.liftUpper ? parseFloat(row.liftUpper) : null,
        confidence: row.confidence ? parseFloat(row.confidence) : null,
        status: row.status,
        isRollup: true,
      });
    }

    return NextResponse.json(result);
  }

  // Default: campaign level
  const campaignConditions = [eq(campaigns.tenantId, tenantId)];
  if (platform) {
    campaignConditions.push(eq(campaigns.source, platform));
  }

  const campaignList: CampaignListRow[] = await withTenant(tenantId, async (tx) => {
    const query = tx
      .select({
        id: campaigns.id,
        name: campaigns.name,
        source: campaigns.source,
        funnelStage: campaigns.funnelStage,
      })
      .from(campaigns);

    // Market filter: only include campaigns assigned to the selected market
    // Drizzle builder is immutable — must capture return value
    const filteredQuery = marketId
      ? query.innerJoin(
          campaignMarkets,
          and(
            eq(campaignMarkets.campaignId, campaigns.id),
            eq(campaignMarkets.marketId, marketId),
          ),
        )
      : query;

    return filteredQuery.where(and(...campaignConditions));
  });

  if (campaignList.length === 0) {
    return NextResponse.json([]);
  }

  const campaignIds = campaignList.map((c: CampaignListRow) => c.id);

  // Aggregate campaign_metrics for date range
  const metricsRows: MetricsRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        campaignId: campaignMetrics.campaignId,
        totalSpend: sum(campaignMetrics.spendUsd),
        totalRevenue: sum(campaignMetrics.directRevenue),
      })
      .from(campaignMetrics)
      .where(
        and(
          eq(campaignMetrics.tenantId, tenantId),
          sql`${campaignMetrics.date} >= ${from}`,
          sql`${campaignMetrics.date} <= ${to}`,
          sql`${campaignMetrics.campaignId} = ANY(ARRAY[${sql.join(
            campaignIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .groupBy(campaignMetrics.campaignId);
  });

  const metricsByCampaign = new Map<string, { spend: number; revenue: number }>(
    metricsRows.map((r: MetricsRow) => [
      r.campaignId,
      {
        spend: parseFloat(r.totalSpend ?? '0'),
        revenue: parseFloat(r.totalRevenue ?? '0'),
      },
    ]),
  );

  // Get latest adjusted incrementality score per campaign
  const latestScores: ScoreRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        campaignId: incrementalityScores.campaignId,
        liftMean: incrementalityScores.liftMean,
        liftLower: incrementalityScores.liftLower,
        liftUpper: incrementalityScores.liftUpper,
        confidence: incrementalityScores.confidence,
        status: incrementalityScores.status,
      })
      .from(incrementalityScores)
      .where(
        and(
          eq(incrementalityScores.tenantId, tenantId),
          eq(incrementalityScores.scoreType, 'adjusted'),
          sql`${incrementalityScores.campaignId} = ANY(ARRAY[${sql.join(
            campaignIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .orderBy(desc(incrementalityScores.scoredAt));
  });

  // Deduplicate to latest score per campaign
  const seenScores = new Set<string>();
  const scoreByCampaign = new Map<string, ScoreRow>();
  for (const score of latestScores) {
    if (!seenScores.has(score.campaignId)) {
      seenScores.add(score.campaignId);
      scoreByCampaign.set(score.campaignId, score);
    }
  }

  // Build response
  const result: CampaignRow[] = campaignList.map((campaign: CampaignListRow) => {
    const metrics = metricsByCampaign.get(campaign.id) ?? { spend: 0, revenue: 0 };
    const score = scoreByCampaign.get(campaign.id);
    const roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;

    return {
      id: campaign.id,
      name: campaign.name,
      platform: campaign.source,
      funnelStage: campaign.funnelStage,
      spend: Math.round(metrics.spend * 100) / 100,
      revenue: Math.round(metrics.revenue * 100) / 100,
      roas: Math.round(roas * 100) / 100,
      liftMean: score?.liftMean ? parseFloat(score.liftMean) : null,
      liftLower: score?.liftLower ? parseFloat(score.liftLower) : null,
      liftUpper: score?.liftUpper ? parseFloat(score.liftUpper) : null,
      confidence: score?.confidence ? parseFloat(score.confidence) : null,
      status: score?.status ?? null,
      isRollup: false,
    };
  });

  return NextResponse.json(result);
}
