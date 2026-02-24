'use client';

import * as React from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { SeasonalEvent } from '@/lib/hooks/useSeasonality';

interface SeasonalTimelineProps {
  events: SeasonalEvent[];
  isLoading?: boolean;
}

/**
 * Returns the relative size class for a timeline marker based on proximity.
 * Events closer in time are more prominent.
 */
function getMarkerSize(weeksUntil: number): string {
  if (weeksUntil < 2) return 'h-5 w-5';
  if (weeksUntil <= 4) return 'h-4 w-4';
  if (weeksUntil <= 8) return 'h-3.5 w-3.5';
  return 'h-3 w-3';
}

function getMarkerColor(weeksUntil: number): string {
  if (weeksUntil < 2) return 'bg-red-500 ring-red-200 dark:ring-red-900';
  if (weeksUntil <= 4) return 'bg-amber-500 ring-amber-200 dark:ring-amber-900';
  return 'bg-emerald-500 ring-emerald-200 dark:ring-emerald-900';
}

function getLabelSize(weeksUntil: number): string {
  if (weeksUntil < 2) return 'text-sm font-semibold';
  if (weeksUntil <= 4) return 'text-xs font-medium';
  return 'text-xs font-normal text-muted-foreground';
}

/**
 * SeasonalTimeline — forward-looking visual horizontal timeline.
 *
 * Events are plotted along a horizontal scroll container.
 * Events closer in time appear larger and more prominent.
 *
 * Per user decision: "Calendar timeline (forward-looking) — visual timeline showing upcoming retail events
 * with budget recommendations per campaign"
 */
export function SeasonalTimeline({ events, isLoading = false }: SeasonalTimelineProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex gap-8 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-2">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No upcoming events in the next 6 months.
        </p>
      </div>
    );
  }

  const now = new Date();
  const totalHorizonDays = Math.max(
    differenceInDays(parseISO(events[events.length - 1]?.eventDate ?? now.toISOString()), now),
    1,
  );

  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Timeline header */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-sm font-medium">Next 6 Months</h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            &lt; 2 weeks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            2–4 weeks
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            &gt; 4 weeks
          </span>
        </div>
      </div>

      {/* Scrollable timeline */}
      <div className="relative overflow-x-auto pb-2" role="list" aria-label="Seasonal events timeline">
        {/* Timeline track */}
        <div className="relative min-w-[600px]">
          {/* Horizontal line */}
          <div className="absolute left-0 right-0 top-[18px] h-px bg-border" aria-hidden="true" />

          {/* Today marker */}
          <div
            className="absolute top-0 flex flex-col items-center"
            style={{ left: '0%' }}
            aria-label="Today"
          >
            <div className="h-4 w-0.5 bg-primary" aria-hidden="true" />
            <span className="mt-1 whitespace-nowrap text-[10px] font-medium text-primary">Today</span>
          </div>

          {/* Event markers */}
          <div className="relative flex justify-between">
            {events.map((event) => {
              const daysFromNow = differenceInDays(parseISO(event.eventDate), now);
              const positionPct = Math.min((daysFromNow / totalHorizonDays) * 100, 100);
              const markerSize = getMarkerSize(event.weeksUntil);
              const markerColor = getMarkerColor(event.weeksUntil);
              const labelSize = getLabelSize(event.weeksUntil);

              let formattedDate = event.eventDate;
              try {
                formattedDate = format(parseISO(event.eventDate), 'MMM d');
              } catch {
                // keep raw
              }

              return (
                <div
                  key={event.id}
                  className="absolute -translate-x-1/2 flex flex-col items-center gap-1"
                  style={{ left: `${positionPct}%` }}
                  role="listitem"
                  aria-label={`${event.name}: ${formattedDate}, ${event.weeksUntil} weeks away`}
                >
                  {/* Dot marker */}
                  <div
                    className={cn(
                      'rounded-full ring-2 ring-offset-background transition-transform hover:scale-125',
                      markerSize,
                      markerColor,
                    )}
                    title={event.name}
                  />

                  {/* Label below */}
                  <div className="mt-2 flex flex-col items-center text-center">
                    <span className={cn('whitespace-nowrap', labelSize)}>
                      {event.name.length > 12 ? `${event.name.slice(0, 12)}…` : event.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formattedDate}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {event.weeksUntil === 0 ? 'This week' : `${event.weeksUntil}w`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Spacer to ensure last event has room */}
          <div className="h-24" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
