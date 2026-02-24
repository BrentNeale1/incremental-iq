'use client';

import * as React from 'react';
import { useSeasonality } from '@/lib/hooks/useSeasonality';
import { SeasonalTimeline } from '@/components/seasonality/SeasonalTimeline';
import { EventCard } from '@/components/seasonality/EventCard';
import { HistoricalComparison } from '@/components/seasonality/HistoricalComparison';
import { TimelineSkeleton } from '@/components/dashboard/SkeletonLoaders';
import { EmptySeasonality } from '@/components/dashboard/EmptyStates';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * PLACEHOLDER tenant ID — Phase 6 (auth) will supply real tenant from session.
 */
const PLACEHOLDER_TENANT_ID = undefined;

/**
 * Seasonality Planning page — proactive seasonal budget preparation.
 *
 * Layout (per design spec: forward-looking, proactive):
 *   Section 1 — SeasonalTimeline: visual forward-looking calendar of upcoming events
 *   Section 2 — EventCard grid: budget recommendations for next 6 weeks (highlighted)
 *   Section 3 — HistoricalComparison: last year vs this year for each event
 *
 * Progressive loading with skeleton placeholders.
 * Mobile-responsive: 1 col on mobile, 2 on sm, 3 on lg.
 */
export default function SeasonalityPlanningPage() {
  const { data, isLoading, isError } = useSeasonality(PLACEHOLDER_TENANT_ID, 6);

  const upcomingEvents = data?.upcoming ?? [];
  const historicalData = data?.historical ?? [];

  // Split events: next 6 weeks (highlighted) vs further out
  const urgentEvents = upcomingEvents.filter((e) => e.weeksUntil <= 6);
  const laterEvents = upcomingEvents.filter((e) => e.weeksUntil > 6);

  // Build a map from event name to its most recent historical lift for EventCard context
  const historicalLiftByEvent = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const hist of historicalData) {
      if (!map.has(hist.eventName) && hist.totalSpend > 0 && hist.totalRevenue > 0) {
        // Compute a rough "lift pct" approximation: (revenue - spend) / spend * 100
        const lift = ((hist.totalRevenue - hist.totalSpend) / hist.totalSpend) * 100;
        if (lift > 0) map.set(hist.eventName, Math.round(lift));
      }
    }
    return map;
  }, [historicalData]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Seasonality Planning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upcoming retail events with budget recommendations based on historical performance.
        </p>
      </div>

      {/* Section 1 — SeasonalTimeline */}
      <section aria-label="Upcoming seasonal events timeline">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Event Calendar
        </h2>
        {isLoading ? (
          <TimelineSkeleton />
        ) : (
          <SeasonalTimeline events={upcomingEvents} isLoading={isLoading} />
        )}
      </section>

      {/* Section 2 — EventCard grid */}
      <section aria-label="Budget recommendations for upcoming events">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {urgentEvents.length > 0 ? 'Next 6 Weeks — Action Required' : 'Upcoming Events'}
        </h2>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">
            Unable to load seasonal events. Retry in a moment.
          </p>
        ) : upcomingEvents.length === 0 ? (
          <EmptySeasonality />
        ) : (
          <div className="space-y-6">
            {/* Urgent events (next 6 weeks) */}
            {urgentEvents.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {urgentEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    historicalLiftPct={historicalLiftByEvent.get(event.name)}
                  />
                ))}
              </div>
            )}

            {/* Later events */}
            {laterEvents.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium text-muted-foreground">Further Out</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {laterEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      historicalLiftPct={historicalLiftByEvent.get(event.name)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 3 — HistoricalComparison */}
      {!isLoading && upcomingEvents.length > 0 && (
        <section aria-label="Year-over-year historical comparison">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Historical Context
          </h2>
          <HistoricalComparison
            upcomingEvents={upcomingEvents}
            historicalData={historicalData}
            isLoading={isLoading}
          />
        </section>
      )}
    </div>
  );
}
