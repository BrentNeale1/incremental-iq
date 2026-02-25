import { NextRequest, NextResponse } from 'next/server';
import { withTenant, incrementalityScores, saturationEstimates, campaigns, campaignMarkets } from '@incremental-iq/db';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * GET /api/dashboard/incrementality
 *
 * Returns incrementality score data for the Statistical Insights page.
 *
 * Two modes:
 *   1. Campaign detail (campaignId provided): time series of scores for a specific campaign
 *   2. Overview (no campaignId): latest score per campaign across all campaigns
 *
 * Both modes include saturation data from saturation_estimates where available.
 *
 * Query params:
 *   tenantId   (required)  — UUID of the requesting tenant
 *   campaignId (optional)  — UUID of specific campaign; if omitted returns overview
 *   scoreType  (optional)  — 'adjusted' (default) | 'raw'
 *
 * Returns:
 *   200: IncrementalityDetail[]
 *   400: { error: string }
 */

interface IncrementalityDetail {
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  scoreType: string;
  scoredAt: Date;
  liftMean: number | null;
  liftLower: number | null;
  liftUpper: number | null;
  confidence: number | null;
  status: string;
  // Saturation data (if available)
  saturationPct: number | null;
  hillAlpha: number | null;
  hillMu: number | null;
  hillGamma: number | null;
}

interface RawScoreRow {
  campaignId: string;
  scoreType: string;
  scoredAt: Date;
  liftMean: string | null;
  liftLower: string | null;
  liftUpper: string | null;
  confidence: string | null;
  status: string;
}

interface RawScoreWithCampaign extends RawScoreRow {
  campaignName: string | null;
  campaignSource: string | null;
}

interface RawSaturationRow {
  campaignId: string;
  saturationPct: string | null;
  hillAlpha: string | null;
  hillMu: string | null;
  hillGamma: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const campaignId = searchParams.get('campaignId');
  const scoreType = searchParams.get('scoreType') ?? 'adjusted';
  const marketId = searchParams.get('marketId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  if (!['adjusted', 'raw'].includes(scoreType)) {
    return NextResponse.json(
      { error: 'Invalid scoreType parameter. Must be: adjusted or raw' },
      { status: 400 },
    );
  }

  if (campaignId) {
    // Campaign detail mode: time series for specific campaign
    const scores: RawScoreRow[] = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          campaignId: incrementalityScores.campaignId,
          scoreType: incrementalityScores.scoreType,
          scoredAt: incrementalityScores.scoredAt,
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
            eq(incrementalityScores.campaignId, campaignId),
            eq(incrementalityScores.scoreType, scoreType),
          ),
        )
        .orderBy(desc(incrementalityScores.scoredAt));
    });

    if (scores.length === 0) {
      return NextResponse.json([]);
    }

    // Get campaign info
    const campaignInfo = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          id: campaigns.id,
          name: campaigns.name,
          source: campaigns.source,
        })
        .from(campaigns)
        .where(
          and(eq(campaigns.tenantId, tenantId), eq(campaigns.id, campaignId)),
        )
        .limit(1);
    });

    // Get latest saturation data
    const saturation: RawSaturationRow[] = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          campaignId: saturationEstimates.campaignId,
          saturationPct: saturationEstimates.saturationPct,
          hillAlpha: saturationEstimates.hillAlpha,
          hillMu: saturationEstimates.hillMu,
          hillGamma: saturationEstimates.hillGamma,
        })
        .from(saturationEstimates)
        .where(
          and(
            eq(saturationEstimates.tenantId, tenantId),
            eq(saturationEstimates.campaignId, campaignId),
            eq(saturationEstimates.status, 'estimated'),
          ),
        )
        .orderBy(desc(saturationEstimates.estimatedAt))
        .limit(1);
    });

    const campaign = campaignInfo[0];
    const sat = saturation[0];

    const result: IncrementalityDetail[] = scores.map((score: RawScoreRow) => ({
      campaignId: score.campaignId,
      campaignName: campaign?.name ?? null,
      platform: campaign?.source ?? null,
      scoreType: score.scoreType,
      scoredAt: score.scoredAt,
      liftMean: score.liftMean ? parseFloat(score.liftMean) : null,
      liftLower: score.liftLower ? parseFloat(score.liftLower) : null,
      liftUpper: score.liftUpper ? parseFloat(score.liftUpper) : null,
      confidence: score.confidence ? parseFloat(score.confidence) : null,
      status: score.status,
      saturationPct: sat?.saturationPct ? parseFloat(sat.saturationPct) : null,
      hillAlpha: sat?.hillAlpha ? parseFloat(sat.hillAlpha) : null,
      hillMu: sat?.hillMu ? parseFloat(sat.hillMu) : null,
      hillGamma: sat?.hillGamma ? parseFloat(sat.hillGamma) : null,
    }));

    return NextResponse.json(result);
  }

  // Overview mode: latest score per campaign
  const allScores: RawScoreWithCampaign[] = await withTenant(tenantId, async (tx) => {
    const conditions = [
      eq(incrementalityScores.tenantId, tenantId),
      eq(incrementalityScores.scoreType, scoreType),
    ];

    // Filter by marketId on the score rows directly
    if (marketId) {
      conditions.push(eq(incrementalityScores.marketId, marketId));
    }

    return tx
      .select({
        campaignId: incrementalityScores.campaignId,
        scoreType: incrementalityScores.scoreType,
        scoredAt: incrementalityScores.scoredAt,
        liftMean: incrementalityScores.liftMean,
        liftLower: incrementalityScores.liftLower,
        liftUpper: incrementalityScores.liftUpper,
        confidence: incrementalityScores.confidence,
        status: incrementalityScores.status,
        campaignName: campaigns.name,
        campaignSource: campaigns.source,
      })
      .from(incrementalityScores)
      .innerJoin(
        campaigns,
        and(
          eq(incrementalityScores.campaignId, campaigns.id),
          eq(campaigns.tenantId, tenantId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(incrementalityScores.scoredAt));
  });

  // Deduplicate to latest score per campaign
  const seen = new Set<string>();
  const latestScores = allScores.filter((s: RawScoreWithCampaign) => {
    if (seen.has(s.campaignId)) return false;
    seen.add(s.campaignId);
    return true;
  });

  if (latestScores.length === 0) {
    return NextResponse.json([]);
  }

  // Get saturation data for all campaigns
  const campaignIds = latestScores.map((s: RawScoreWithCampaign) => s.campaignId);

  const saturationRows: RawSaturationRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        campaignId: saturationEstimates.campaignId,
        saturationPct: saturationEstimates.saturationPct,
        hillAlpha: saturationEstimates.hillAlpha,
        hillMu: saturationEstimates.hillMu,
        hillGamma: saturationEstimates.hillGamma,
      })
      .from(saturationEstimates)
      .where(
        and(
          eq(saturationEstimates.tenantId, tenantId),
          eq(saturationEstimates.status, 'estimated'),
          sql`${saturationEstimates.campaignId} = ANY(ARRAY[${sql.join(
            campaignIds.map((id: string) => sql`${id}::uuid`),
            sql`, `,
          )}])`,
        ),
      )
      .orderBy(desc(saturationEstimates.estimatedAt));
  });

  // Deduplicate saturation to latest per campaign
  const seenSat = new Set<string>();
  const satByCampaign = new Map<string, RawSaturationRow>();
  for (const s of saturationRows) {
    if (!seenSat.has(s.campaignId)) {
      seenSat.add(s.campaignId);
      satByCampaign.set(s.campaignId, s);
    }
  }

  const result: IncrementalityDetail[] = latestScores.map((score: RawScoreWithCampaign) => {
    const sat = satByCampaign.get(score.campaignId);
    return {
      campaignId: score.campaignId,
      campaignName: score.campaignName ?? null,
      platform: score.campaignSource ?? null,
      scoreType: score.scoreType,
      scoredAt: score.scoredAt,
      liftMean: score.liftMean ? parseFloat(score.liftMean) : null,
      liftLower: score.liftLower ? parseFloat(score.liftLower) : null,
      liftUpper: score.liftUpper ? parseFloat(score.liftUpper) : null,
      confidence: score.confidence ? parseFloat(score.confidence) : null,
      status: score.status,
      saturationPct: sat?.saturationPct ? parseFloat(sat.saturationPct) : null,
      hillAlpha: sat?.hillAlpha ? parseFloat(sat.hillAlpha) : null,
      hillMu: sat?.hillMu ? parseFloat(sat.hillMu) : null,
      hillGamma: sat?.hillGamma ? parseFloat(sat.hillGamma) : null,
    };
  });

  return NextResponse.json(result);
}
