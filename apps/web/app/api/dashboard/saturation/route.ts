import { NextRequest, NextResponse } from 'next/server';
import { withTenant, saturationEstimates, campaigns, campaignMarkets } from '@incremental-iq/db';
import { eq, and, desc, sql } from 'drizzle-orm';

/**
 * GET /api/dashboard/saturation
 *
 * Returns Hill curve saturation data for the Statistical Insights page.
 * Used to render saturation curve charts showing diminishing returns.
 *
 * Two modes:
 *   1. Single campaign (campaignId provided): detailed curve data points for chart
 *      Returns Hill curve parameters + 100 data points for smooth rendering
 *   2. Overview (no campaignId): latest saturation estimate per campaign
 *
 * Query params:
 *   tenantId   (required) — UUID of the requesting tenant
 *   campaignId (optional) — UUID of specific campaign for detailed curve
 *
 * Returns:
 *   200: SaturationResponse
 *   400: { error: string }
 */

interface SaturationRow {
  campaignId: string;
  campaignName: string | null;
  platform: string | null;
  saturationPct: number | null;
  hillAlpha: number | null;
  hillMu: number | null;
  hillGamma: number | null;
  status: string;
  estimatedAt: Date;
}

interface CurveDataPoint {
  spendLevel: number;   // X axis: daily spend
  revenue: number;      // Y axis: estimated revenue from Hill function
  isCurrentSpend: boolean; // marks the current operating point
}

interface SaturationDetailResponse {
  campaign: SaturationRow;
  curvePoints: CurveDataPoint[];
  currentSpendLevel: number;
}

type SaturationResponse = SaturationRow[] | SaturationDetailResponse;

/** Hill function: f(x) = alpha * x^gamma / (mu^gamma + x^gamma) */
function hillFn(x: number, alpha: number, mu: number, gamma: number): number {
  if (x <= 0) return 0;
  return alpha * Math.pow(x, gamma) / (Math.pow(mu, gamma) + Math.pow(x, gamma));
}

/** Generate 100 data points along the Hill curve from 0 to 2x the half-saturation point */
function generateCurvePoints(
  hillAlpha: number,
  hillMu: number,
  hillGamma: number,
  currentSpend: number,
  numPoints = 100,
): CurveDataPoint[] {
  const maxX = Math.max(hillMu * 2, currentSpend * 1.5);
  const step = maxX / numPoints;

  return Array.from({ length: numPoints + 1 }, (_, i) => {
    const spendLevel = i * step;
    const revenue = hillFn(spendLevel, hillAlpha, hillMu, hillGamma);
    const isCurrentSpend = Math.abs(spendLevel - currentSpend) < step / 2;
    return {
      spendLevel: Math.round(spendLevel * 100) / 100,
      revenue: Math.round(revenue * 100) / 100,
      isCurrentSpend,
    };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const campaignId = searchParams.get('campaignId');
  const marketId = searchParams.get('marketId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  if (campaignId) {
    // Campaign detail mode
    const rows = await withTenant(tenantId, async (tx) => {
      return tx
        .select({
          campaignId: saturationEstimates.campaignId,
          saturationPct: saturationEstimates.saturationPct,
          hillAlpha: saturationEstimates.hillAlpha,
          hillMu: saturationEstimates.hillMu,
          hillGamma: saturationEstimates.hillGamma,
          status: saturationEstimates.status,
          estimatedAt: saturationEstimates.estimatedAt,
          campaignName: campaigns.name,
          campaignSource: campaigns.source,
        })
        .from(saturationEstimates)
        .innerJoin(
          campaigns,
          and(
            eq(saturationEstimates.campaignId, campaigns.id),
            eq(campaigns.tenantId, tenantId),
          ),
        )
        .where(
          and(
            eq(saturationEstimates.tenantId, tenantId),
            eq(saturationEstimates.campaignId, campaignId),
          ),
        )
        .orderBy(desc(saturationEstimates.estimatedAt))
        .limit(1);
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No saturation data found for this campaign' },
        { status: 404 },
      );
    }

    const row = rows[0];
    const satRow: SaturationRow = {
      campaignId: row.campaignId,
      campaignName: row.campaignName ?? null,
      platform: row.campaignSource ?? null,
      saturationPct: row.saturationPct ? parseFloat(row.saturationPct) : null,
      hillAlpha: row.hillAlpha ? parseFloat(row.hillAlpha) : null,
      hillMu: row.hillMu ? parseFloat(row.hillMu) : null,
      hillGamma: row.hillGamma ? parseFloat(row.hillGamma) : null,
      status: row.status,
      estimatedAt: row.estimatedAt,
    };

    // Generate curve points if Hill parameters are available
    let curvePoints: CurveDataPoint[] = [];
    let currentSpendLevel = 0;

    if (satRow.hillAlpha && satRow.hillMu && satRow.hillGamma && satRow.saturationPct !== null) {
      // Estimate current spend from saturation position:
      // saturationPct = currentSpend / (theoretical saturation point)
      // The half-saturation point (hillMu) is where 50% of max revenue is achieved.
      // Current spend ≈ saturationPct * (some reference point)
      // Use hillMu as reference: if satPct=0.5, spend ≈ hillMu
      currentSpendLevel = satRow.saturationPct > 0
        ? satRow.hillMu * satRow.saturationPct * 2
        : 0;

      curvePoints = generateCurvePoints(
        satRow.hillAlpha,
        satRow.hillMu,
        satRow.hillGamma,
        currentSpendLevel,
      );
    }

    const response: SaturationDetailResponse = {
      campaign: satRow,
      curvePoints,
      currentSpendLevel: Math.round(currentSpendLevel * 100) / 100,
    };

    return NextResponse.json(response);
  }

  // Overview mode: latest saturation estimate per campaign
  const allRows = await withTenant(tenantId, async (tx) => {
    const query = tx
      .select({
        campaignId: saturationEstimates.campaignId,
        saturationPct: saturationEstimates.saturationPct,
        hillAlpha: saturationEstimates.hillAlpha,
        hillMu: saturationEstimates.hillMu,
        hillGamma: saturationEstimates.hillGamma,
        status: saturationEstimates.status,
        estimatedAt: saturationEstimates.estimatedAt,
        campaignName: campaigns.name,
        campaignSource: campaigns.source,
      })
      .from(saturationEstimates)
      .innerJoin(
        campaigns,
        and(
          eq(saturationEstimates.campaignId, campaigns.id),
          eq(campaigns.tenantId, tenantId),
        ),
      );

    // Market filter via campaign_markets JOIN
    if (marketId) {
      query.innerJoin(
        campaignMarkets,
        and(
          eq(campaignMarkets.campaignId, saturationEstimates.campaignId),
          eq(campaignMarkets.marketId, marketId),
        ),
      );
    }

    return query
      .where(eq(saturationEstimates.tenantId, tenantId))
      .orderBy(desc(saturationEstimates.estimatedAt));
  });

  // Deduplicate to latest per campaign
  const seen = new Set<string>();
  const result: SaturationRow[] = [];

  for (const row of allRows) {
    if (seen.has(row.campaignId)) continue;
    seen.add(row.campaignId);

    result.push({
      campaignId: row.campaignId,
      campaignName: row.campaignName ?? null,
      platform: row.campaignSource ?? null,
      saturationPct: row.saturationPct ? parseFloat(row.saturationPct) : null,
      hillAlpha: row.hillAlpha ? parseFloat(row.hillAlpha) : null,
      hillMu: row.hillMu ? parseFloat(row.hillMu) : null,
      hillGamma: row.hillGamma ? parseFloat(row.hillGamma) : null,
      status: row.status,
      estimatedAt: row.estimatedAt,
    });
  }

  return NextResponse.json(result);
}
