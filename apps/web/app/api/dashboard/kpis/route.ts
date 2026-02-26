import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { withTenant, campaignMetrics, campaignMarkets } from '@incremental-iq/db';
import { eq, and, sql, sum } from 'drizzle-orm';

/**
 * GET /api/dashboard/kpis
 *
 * Returns aggregated KPIs for the requested date range from campaign_metrics.
 * Supports optional comparison period to compute period-over-period deltas.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Query params:
 *   from        (required) — ISO date string, e.g. "2025-01-01"
 *   to          (required) — ISO date string, e.g. "2025-01-31"
 *   compareFrom (optional) — ISO date string for comparison period start
 *   compareTo   (optional) — ISO date string for comparison period end
 *
 * Returns:
 *   200: KpiResponse
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 */

interface KpiAggregate {
  spend: number;
  revenue: number;
  roas: number;
  incrementalRevenue: number;
  liftPct: number;
}

interface KpiResponse {
  period: KpiAggregate;
  comparison?: {
    period: KpiAggregate;
    spendDelta: number;
    spendDeltaPct: number;
    revenueDelta: number;
    revenueDeltaPct: number;
    roasDelta: number;
    roasDeltaPct: number;
    incrementalRevenueDelta: number;
    incrementalRevenueDeltaPct: number;
    liftPctDelta: number;
  };
}

async function aggregateKpis(
  tenantId: string,
  from: string,
  to: string,
  marketId?: string | null,
): Promise<KpiAggregate> {
  const rows = await withTenant(tenantId, async (tx) => {
    const query = tx
      .select({
        totalSpend: sum(campaignMetrics.spendUsd),
        totalDirectRevenue: sum(campaignMetrics.directRevenue),
        totalModeledRevenue: sum(campaignMetrics.modeledRevenue),
        totalIncrementalRevenue: sum(
          sql`CASE WHEN ${campaignMetrics.modeledRevenue} IS NOT NULL AND ${campaignMetrics.directRevenue} IS NOT NULL
              THEN ${campaignMetrics.modeledRevenue} - ${campaignMetrics.directRevenue}
              ELSE NULL END`,
        ),
      })
      .from(campaignMetrics);

    // Market filter: INNER JOIN on campaign_markets when marketId specified
    // Drizzle builder is immutable — must capture return value
    const filteredQuery = marketId
      ? query.innerJoin(
          campaignMarkets,
          and(
            eq(campaignMarkets.campaignId, campaignMetrics.campaignId),
            eq(campaignMarkets.marketId, marketId),
          ),
        )
      : query;

    return filteredQuery.where(
      and(
        eq(campaignMetrics.tenantId, tenantId),
        sql`${campaignMetrics.date} >= ${from}`,
        sql`${campaignMetrics.date} <= ${to}`,
      ),
    );
  });

  const row = rows[0];
  const spend = parseFloat(row?.totalSpend ?? '0');
  const revenue = parseFloat(row?.totalDirectRevenue ?? '0');
  const modeledRevenue = parseFloat((row?.totalModeledRevenue as string | null) ?? '0');
  const roas = spend > 0 ? revenue / spend : 0;

  // Incremental revenue = modeled lift applied to spend
  // Use modeled_revenue - direct_revenue as a proxy for incremental attribution
  const incrementalRevenue = Math.max(0, modeledRevenue - revenue);
  const liftPct = revenue > 0 ? (incrementalRevenue / revenue) * 100 : 0;

  return {
    spend: Math.round(spend * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    incrementalRevenue: Math.round(incrementalRevenue * 100) / 100,
    liftPct: Math.round(liftPct * 10) / 10,
  };
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
  const compareFrom = searchParams.get('compareFrom');
  const compareTo = searchParams.get('compareTo');
  const marketId = searchParams.get('marketId');

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Missing required query parameters: from, to' },
      { status: 400 },
    );
  }

  const period = await aggregateKpis(tenantId, from, to, marketId);
  const response: KpiResponse = { period };

  // Optional comparison period
  if (compareFrom && compareTo) {
    const comparisonPeriod = await aggregateKpis(tenantId, compareFrom, compareTo, marketId);

    const delta = (current: number, previous: number) => ({
      delta: Math.round((current - previous) * 100) / 100,
      deltaPct: previous !== 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : 0,
    });

    const spendDelta = delta(period.spend, comparisonPeriod.spend);
    const revenueDelta = delta(period.revenue, comparisonPeriod.revenue);
    const roasDelta = delta(period.roas, comparisonPeriod.roas);
    const incrementalRevenueDelta = delta(period.incrementalRevenue, comparisonPeriod.incrementalRevenue);

    response.comparison = {
      period: comparisonPeriod,
      spendDelta: spendDelta.delta,
      spendDeltaPct: spendDelta.deltaPct,
      revenueDelta: revenueDelta.delta,
      revenueDeltaPct: revenueDelta.deltaPct,
      roasDelta: roasDelta.delta,
      roasDeltaPct: roasDelta.deltaPct,
      incrementalRevenueDelta: incrementalRevenueDelta.delta,
      incrementalRevenueDeltaPct: incrementalRevenueDelta.deltaPct,
      liftPctDelta: Math.round((period.liftPct - comparisonPeriod.liftPct) * 10) / 10,
    };
  }

  return NextResponse.json(response);
}
