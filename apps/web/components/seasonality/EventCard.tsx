'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SeasonalEvent } from '@/lib/hooks/useSeasonality';

interface EventCardProps {
  event: SeasonalEvent;
  /** Optional recommendation message for this event */
  recommendationMessage?: string;
  /** Optional historical lift percentage from last year */
  historicalLiftPct?: number;
}

/**
 * Returns urgency configuration based on weeks until event.
 * < 2 weeks: red (urgent)
 * 2-4 weeks: yellow (soon)
 * > 4 weeks: green (upcoming)
 */
function getUrgencyConfig(weeksUntil: number) {
  if (weeksUntil < 2) {
    return {
      color: 'border-red-400 bg-red-50 dark:bg-red-950/30',
      badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      label: 'Urgent',
      dotClass: 'bg-red-500',
    };
  }
  if (weeksUntil <= 4) {
    return {
      color: 'border-amber-400 bg-amber-50 dark:bg-amber-950/30',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
      label: 'Soon',
      dotClass: 'bg-amber-500',
    };
  }
  return {
    color: 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    label: 'Upcoming',
    dotClass: 'bg-emerald-500',
  };
}

/**
 * Formats the "weeks until" as a readable string.
 */
function formatTimeUntil(weeksUntil: number, daysUntil: number): string {
  if (daysUntil <= 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil < 7) return `In ${daysUntil} days`;
  if (weeksUntil === 1) return 'In 1 week';
  return `In ${weeksUntil} weeks`;
}

/**
 * EventCard — individual seasonal event detail card.
 *
 * Shows: event name, date, time until, historical context, recommended action.
 * Color-coded by proximity: red (<2w), yellow (2-4w), green (>4w).
 *
 * Per user decision format: "BFCM in 6 weeks: Campaign X scaled +40% last year, consider ramping now"
 */
export function EventCard({ event, recommendationMessage, historicalLiftPct }: EventCardProps) {
  const urgency = getUrgencyConfig(event.weeksUntil);
  const timeUntil = formatTimeUntil(event.weeksUntil, event.daysUntil);

  let formattedDate = event.eventDate;
  try {
    formattedDate = format(parseISO(event.eventDate), 'MMM d, yyyy');
  } catch {
    // Keep raw string if parse fails
  }

  // Build the recommendation message
  const message = recommendationMessage
    ?? (historicalLiftPct != null && historicalLiftPct > 0
      ? `${event.name} in ${event.weeksUntil} weeks: scaled +${historicalLiftPct}% last year — consider ramping now`
      : `${event.name} in ${event.weeksUntil} weeks — plan your budget allocation`);

  return (
    <Card className={cn('border-l-4 transition-colors', urgency.color)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full shrink-0 mt-0.5', urgency.dotClass)} aria-hidden="true" />
            <h3 className="text-sm font-semibold leading-tight">{event.name}</h3>
          </div>
          <Badge variant="outline" className={cn('shrink-0 text-xs', urgency.badgeClass)}>
            {urgency.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-0 space-y-2">
        {/* Date + time until */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{formattedDate}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="font-medium text-foreground">{timeUntil}</span>
        </div>

        {/* Recommendation message */}
        <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>

        {/* Historical lift badge */}
        {historicalLiftPct != null && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Last year:</span>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              +{historicalLiftPct}% lift
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
