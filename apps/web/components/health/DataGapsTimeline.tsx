'use client';

import * as React from 'react';
import { format, eachDayOfInterval, subDays, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { IntegrationSyncHistory } from '@/lib/hooks/useSyncHistory';

interface DataGapsTimelineProps {
  integrations: IntegrationSyncHistory[];
  isLoading: boolean;
}

interface DayStatus {
  date: string;
  hasData: boolean;
  isFuture: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  google_ads: 'Google Ads',
  shopify: 'Shopify',
};

/**
 * DataGapsTimeline — visual timeline showing data coverage over the last 90 days.
 *
 * For each integration: colored bar showing days with data (green) vs days missing (red gaps).
 * Uses CSS grid visualization — each day is a small colored cell.
 *
 * "Data present" is inferred from integration status and lastSyncStatus:
 *   - Integrations with no errors are assumed to have data
 *   - Stale integrations show gaps starting from their staleness point
 *   - Error/disconnected integrations show gaps for the full 90 days
 *
 * Per design spec: "Missing data gaps over time."
 */
export function DataGapsTimeline({ integrations, isLoading }: DataGapsTimelineProps) {
  const today = new Date();
  const startDate = subDays(today, 89); // Last 90 days

  const days = eachDayOfInterval({ start: startDate, end: today });

  const timelineData = React.useMemo(() => {
    return integrations.map((item) => {
      const { integration, isStale, staleSinceHours } = item;

      // Determine the cutoff date — before this date we assume data exists
      let gapStartDate: Date | null = null;

      if (integration.status === 'disconnected') {
        // No data at all
        gapStartDate = startDate;
      } else if (isStale && staleSinceHours != null) {
        // Stale — gap starts staleSinceHours ago
        gapStartDate = new Date(today.getTime() - staleSinceHours * 60 * 60 * 1000);
      } else if (integration.status === 'error') {
        // Error — assume gap for last 2 days
        gapStartDate = subDays(today, 2);
      }

      const dayStatuses: DayStatus[] = days.map((day) => {
        const isFuture = day > today;
        const hasData = gapStartDate === null || day < gapStartDate;
        return {
          date: format(day, 'yyyy-MM-dd'),
          hasData,
          isFuture,
        };
      });

      const gapDays = dayStatuses.filter((d) => !d.hasData && !d.isFuture).length;
      const coveragePct = Math.round(((days.length - gapDays) / days.length) * 100);

      return {
        integration,
        dayStatuses,
        gapDays,
        coveragePct,
      };
    });
  }, [integrations, days]);

  // Month labels for the header — must be called before any early returns
  const monthLabels = React.useMemo(() => {
    const labels: { label: string; dayIndex: number }[] = [];
    let lastMonth = '';
    days.forEach((day, i) => {
      const month = format(day, 'MMM');
      if (month !== lastMonth) {
        labels.push({ label: month, dayIndex: i });
        lastMonth = month;
      }
    });
    return labels;
  }, [days]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <Skeleton className="mb-3 h-4 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No integrations to display. Connect platforms to see data coverage.
      </div>
    );
  }

  const CELL_W = 6; // px width per day cell
  const CELL_GAP = 1; // px gap between cells

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="space-y-4">
        {/* Month axis header */}
        <div className="relative pl-32" style={{ height: 16 }}>
          {monthLabels.map(({ label, dayIndex }) => (
            <span
              key={label + dayIndex}
              className="absolute text-[10px] text-muted-foreground"
              style={{ left: 128 + dayIndex * (CELL_W + CELL_GAP) }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* Per-integration rows */}
        {timelineData.map(({ integration, dayStatuses, gapDays, coveragePct }) => {
          const platformLabel =
            PLATFORM_LABELS[integration.platform?.toLowerCase() ?? ''] ?? integration.platform;

          return (
            <div key={integration.id} className="flex items-center gap-4">
              {/* Integration label */}
              <div className="w-32 shrink-0">
                <p className="truncate text-sm font-medium">{platformLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {coveragePct}% coverage
                  {gapDays > 0 && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      ({gapDays} gap{gapDays !== 1 ? 's' : ''})
                    </span>
                  )}
                </p>
              </div>

              {/* Day cells */}
              <div className="flex items-center gap-px overflow-x-auto">
                {dayStatuses.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.hasData ? 'data present' : 'no data'}`}
                    className={cn(
                      'h-6 shrink-0 rounded-sm',
                      day.isFuture
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : day.hasData
                          ? 'bg-emerald-400 dark:bg-emerald-600'
                          : 'bg-red-400 dark:bg-red-700',
                    )}
                    style={{ width: CELL_W }}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
            Data present
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-400 dark:bg-red-700" />
            No data / gap
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm bg-slate-100 dark:bg-slate-800" />
            Future
          </div>
        </div>
      </div>
    </div>
  );
}
