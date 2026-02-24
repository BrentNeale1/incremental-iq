/**
 * Seasonal alerts helper — reads upcoming retail and brand events and enriches
 * them with historical performance data from the previous year.
 *
 * System events (tenantId IS NULL) are readable by all tenants via RLS.
 * Brand events (tenantId set) are readable only by the owning tenant.
 */

import { withTenant } from '@incremental-iq/db';
import { seasonalEvents, incrementalityScores } from '@incremental-iq/db';
import { and, eq, desc, sql } from 'drizzle-orm';
import type { SeasonalAlert } from './types';

/** How far forward to scan for upcoming events (in weeks) */
const UPCOMING_WINDOW_WEEKS = 8;

/**
 * Returns SeasonalAlert[] for events occurring within the next 8 weeks,
 * enriched with historical lift data from the same calendar period last year.
 *
 * Sorted by event date ascending (soonest first).
 */
export async function getUpcomingSeasonalAlerts(tenantId: string): Promise<SeasonalAlert[]> {
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + UPCOMING_WINDOW_WEEKS * 7);

  const nowStr = now.toISOString().slice(0, 10);
  const windowEndStr = windowEnd.toISOString().slice(0, 10);

  const events = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: seasonalEvents.id,
        name: seasonalEvents.name,
        eventDate: seasonalEvents.eventDate,
        tenantId: seasonalEvents.tenantId,
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

  if (events.length === 0) {
    return [];
  }

  // For each event, look up historical incrementality from the same period last year
  const alerts: SeasonalAlert[] = [];

  for (const event of events) {
    const eventDate = new Date(event.eventDate);
    const weeksUntil = Math.round(
      (eventDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );

    // Look up last year's scores around the same date (±2 weeks window)
    const lastYearDate = new Date(eventDate);
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
    const lastYearStart = new Date(lastYearDate);
    lastYearStart.setDate(lastYearStart.getDate() - 14);
    const lastYearEnd = new Date(lastYearDate);
    lastYearEnd.setDate(lastYearEnd.getDate() + 14);

    let historicalLiftPct: number | undefined;
    try {
      const historicalScores = await withTenant(tenantId, async (tx) => {
        return tx
          .select({
            liftMean: incrementalityScores.liftMean,
          })
          .from(incrementalityScores)
          .where(
            and(
              eq(incrementalityScores.tenantId, tenantId),
              eq(incrementalityScores.scoreType, 'adjusted'),
              sql`${incrementalityScores.scoredAt} >= ${lastYearStart.toISOString()}`,
              sql`${incrementalityScores.scoredAt} <= ${lastYearEnd.toISOString()}`,
            ),
          )
          .orderBy(desc(incrementalityScores.scoredAt))
          .limit(20);
      });

      if (historicalScores.length > 0) {
        const validScores = historicalScores
          .map((s: { liftMean: string | null }) => (s.liftMean ? parseFloat(s.liftMean) : null))
          .filter((v: number | null): v is number => v !== null);

        if (validScores.length > 0) {
          const avgLift = validScores.reduce((a: number, b: number) => a + b, 0) / validScores.length;
          historicalLiftPct = Math.round(avgLift * 100);
        }
      }
    } catch {
      // Non-critical — proceed without historical data
    }

    const historicalSuffix =
      historicalLiftPct !== undefined
        ? `: consider ramping now — scaled +${historicalLiftPct}% last year`
        : ': consider ramping budgets now';

    alerts.push({
      eventName: event.name,
      weeksUntil,
      message: `${event.name} in ${weeksUntil} week${weeksUntil === 1 ? '' : 's'}${historicalSuffix}`,
      historicalLiftPct,
    });
  }

  return alerts;
}
