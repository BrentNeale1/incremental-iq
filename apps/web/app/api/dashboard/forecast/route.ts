import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { withTenant, campaignMetrics } from '@incremental-iq/db';
import { eq, and, sql } from 'drizzle-orm';
import { subDays } from 'date-fns';

/**
 * GET /api/dashboard/forecast
 *
 * Fetches Prophet forecast for a specific campaign.
 * Returns historical fitted values, future predictions, and actual observed values.
 *
 * Requires an active session (tenantId extracted from session cookie).
 * Proxies to Python FastAPI service at ANALYSIS_SERVICE_URL/forecast.
 * Gracefully degrades: returns empty arrays when Python service is unavailable.
 *
 * Query params:
 *   campaignId  (required) — Campaign ID to forecast
 *
 * Returns:
 *   200: { historical: ForecastPoint[], future: ForecastPoint[], actuals: ActualPoint[] }
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 */

const ANALYSIS_SERVICE_URL = process.env.ANALYSIS_SERVICE_URL ?? 'http://localhost:8000';
const MIN_DATA_POINTS = 30;

interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

interface ActualPoint {
  date: string;
  value: number;
}

interface ForecastResponse {
  historical: ForecastPoint[];
  future: ForecastPoint[];
  actuals: ActualPoint[];
}

const EMPTY_RESPONSE: ForecastResponse = {
  historical: [],
  future: [],
  actuals: [],
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');

  if (!campaignId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: campaignId' },
      { status: 400 },
    );
  }

  // Fetch last 365 days of campaign metrics from DB
  const cutoffDate = subDays(new Date(), 365);
  const cutoff = cutoffDate.toISOString().split('T')[0]; // yyyy-MM-dd

  const rows = await withTenant<
    { date: string; spendUsd: string | null; directRevenue: string | null; directConversions: string | null }[]
  >(tenantId, async (tx) => {
    return tx
      .select({
        date: campaignMetrics.date,
        spendUsd: campaignMetrics.spendUsd,
        directRevenue: campaignMetrics.directRevenue,
        directConversions: campaignMetrics.directConversions,
      })
      .from(campaignMetrics)
      .where(
        and(
          eq(campaignMetrics.tenantId, tenantId),
          eq(campaignMetrics.campaignId, campaignId),
          sql`${campaignMetrics.date} >= ${cutoff}`,
        ),
      )
      .orderBy(campaignMetrics.date);
  });

  // Insufficient data for meaningful forecast
  if (rows.length < MIN_DATA_POINTS) {
    return NextResponse.json(EMPTY_RESPONSE);
  }

  // Actuals: observed revenue for historical chart layer
  const actuals: ActualPoint[] = rows.map((m) => ({
    date: m.date,
    value: parseFloat(m.directRevenue ?? '0'),
  }));

  // Proxy to Python FastAPI service
  try {
    const pythonBody = {
      tenant_id: tenantId,
      campaign_id: campaignId,
      metrics: rows.map((m) => ({
        date: m.date,
        spend_usd: parseFloat(m.spendUsd ?? '0'),
        revenue: parseFloat(m.directRevenue ?? '0'),
        conversions: parseFloat(m.directConversions ?? '0'),
      })),
      forecast_days: 90,
    };

    const pythonRes = await fetch(`${ANALYSIS_SERVICE_URL}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pythonBody),
    });

    if (!pythonRes.ok) {
      return NextResponse.json(EMPTY_RESPONSE);
    }

    const pythonData = (await pythonRes.json()) as { forecast: ForecastPoint[] };
    const today = new Date().toISOString().split('T')[0];

    const historical: ForecastPoint[] = pythonData.forecast.filter((p) => p.date <= today);
    const future: ForecastPoint[] = pythonData.forecast.filter((p) => p.date > today);

    return NextResponse.json({ historical, future, actuals });
  } catch {
    // Python service unavailable — graceful degradation
    return NextResponse.json(EMPTY_RESPONSE);
  }
}
