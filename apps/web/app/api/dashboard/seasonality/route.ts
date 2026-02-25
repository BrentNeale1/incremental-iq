import { NextRequest, NextResponse } from 'next/server';
import { withTenant, seasonalEvents, campaignMetrics, campaignMarkets } from '@incremental-iq/db';
import { eq, and, sql, sum } from 'drizzle-orm';

/**
 * GET /api/dashboard/seasonality
 *
 * Returns upcoming seasonal events and historical performance data for the
 * Seasonality Planning page.
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *   months   (optional) — number of months to look forward (default: 6)
 *
 * Returns:
 *   200: SeasonalityResponse
 *   400: { error: string }
 */

interface SeasonalEventRow {
  id: string;
  name: string;
  eventDate: string;
  windowBefore: string | null;
  windowAfter: string | null;
  isUserDefined: boolean;
  year: string | null;
  weeksUntil: number;
  daysUntil: number;
}

interface HistoricalPerformance {
  eventName: string;
  year: number;
  periodFrom: string;
  periodTo: string;
  totalSpend: number;
  totalRevenue: number;
  roas: number;
}

interface SeasonalityResponse {
  upcoming: SeasonalEventRow[];
  historical: HistoricalPerformance[];
}

interface RawSeasonalEvent {
  id: string;
  name: string;
  eventDate: string;
  windowBefore: string | null;
  windowAfter: string | null;
  isUserDefined: boolean;
  year: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const monthsParam = searchParams.get('months');
  const marketId = searchParams.get('marketId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  const months = monthsParam ? parseInt(monthsParam, 10) : 6;
  if (isNaN(months) || months < 1 || months > 24) {
    return NextResponse.json(
      { error: 'Invalid months parameter. Must be between 1 and 24.' },
      { status: 400 },
    );
  }

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setMonth(windowEnd.getMonth() + months);

  const nowStr = now.toISOString().slice(0, 10);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  // Query upcoming events (system events + tenant-specific events via RLS)
  const events: RawSeasonalEvent[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: seasonalEvents.id,
        name: seasonalEvents.name,
        eventDate: seasonalEvents.eventDate,
        windowBefore: seasonalEvents.windowBefore,
        windowAfter: seasonalEvents.windowAfter,
        isUserDefined: seasonalEvents.isUserDefined,
        year: seasonalEvents.year,
      })
      .from(seasonalEvents)
      .where(
        and(
          sql`${seasonalEvents.eventDate} > ${nowStr}`,
          sql`${seasonalEvents.eventDate} <= ${windowEndStr}`,
        ),
      )
      .orderBy(seasonalEvents.eventDate);
  });

  const upcoming: SeasonalEventRow[] = events.map((event: RawSeasonalEvent) => {
    const eventDate = new Date(event.eventDate);
    const msUntil = eventDate.getTime() - now.getTime();
    const daysUntil = Math.round(msUntil / (24 * 60 * 60 * 1000));
    const weeksUntil = Math.round(daysUntil / 7);

    return {
      id: event.id,
      name: event.name,
      eventDate: event.eventDate,
      windowBefore: event.windowBefore,
      windowAfter: event.windowAfter,
      isUserDefined: event.isUserDefined,
      year: event.year,
      weeksUntil,
      daysUntil,
    };
  });

  // For each event, query historical performance from prior years
  const historical: HistoricalPerformance[] = [];

  for (const event of events.slice(0, 10)) {
    const eventDate = new Date(event.eventDate);
    const windowBefore = parseInt(event.windowBefore ?? '7', 10);
    const windowAfter = parseInt(event.windowAfter ?? '7', 10);

    // Check last 2 years
    for (let yearsBack = 1; yearsBack <= 2; yearsBack++) {
      const historicalDate = new Date(eventDate);
      historicalDate.setFullYear(historicalDate.getFullYear() - yearsBack);

      const periodFrom = new Date(historicalDate);
      periodFrom.setDate(periodFrom.getDate() - windowBefore);
      const periodTo = new Date(historicalDate);
      periodTo.setDate(periodTo.getDate() + windowAfter);

      const periodFromStr = periodFrom.toISOString().slice(0, 10);
      const periodToStr = periodTo.toISOString().slice(0, 10);

      try {
        const metricsRows = await withTenant(tenantId, async (tx) => {
          const query = tx
            .select({
              totalSpend: sum(campaignMetrics.spendUsd),
              totalRevenue: sum(campaignMetrics.directRevenue),
            })
            .from(campaignMetrics);

          if (marketId) {
            query.innerJoin(
              campaignMarkets,
              and(
                eq(campaignMarkets.campaignId, campaignMetrics.campaignId),
                eq(campaignMarkets.marketId, marketId),
              ),
            );
          }

          return query.where(
            and(
              eq(campaignMetrics.tenantId, tenantId),
              sql`${campaignMetrics.date} >= ${periodFromStr}`,
              sql`${campaignMetrics.date} <= ${periodToStr}`,
            ),
          );
        });

        const row = metricsRows[0];
        const totalSpend = parseFloat(row?.totalSpend ?? '0');
        const totalRevenue = parseFloat(row?.totalRevenue ?? '0');

        if (totalSpend > 0 || totalRevenue > 0) {
          historical.push({
            eventName: event.name,
            year: historicalDate.getFullYear(),
            periodFrom: periodFromStr,
            periodTo: periodToStr,
            totalSpend: Math.round(totalSpend * 100) / 100,
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            roas: totalSpend > 0
              ? Math.round((totalRevenue / totalSpend) * 100) / 100
              : 0,
          });
        }
      } catch {
        // Non-critical — continue without this year's data
      }
    }
  }

  const response: SeasonalityResponse = { upcoming, historical };
  return NextResponse.json(response);
}
