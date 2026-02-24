'use client';

import { Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SeasonalAlert } from '@/lib/recommendations/types';

export interface SeasonalAlertCardProps {
  alert: SeasonalAlert;
  className?: string;
}

/**
 * SeasonalAlertCard — proactive seasonal event alert.
 *
 * Format per user decision: "BFCM in 6 weeks: Campaign X scaled +40% last year, consider ramping now"
 * Distinct visual: accent color border + calendar icon.
 * Rendered in the dedicated "Upcoming" section at the top of the Executive Overview.
 */
export function SeasonalAlertCard({ alert, className }: SeasonalAlertCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden border-l-4 border-l-brand-accent bg-brand-accent/5',
        className,
      )}
    >
      <CardContent className="flex items-start gap-3 py-3">
        <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium leading-tight">
            <span className="text-brand-accent">{alert.eventName}</span>
            {' in '}
            <span className="font-bold">
              {alert.weeksUntil} week{alert.weeksUntil === 1 ? '' : 's'}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">{alert.message}</p>
          {alert.historicalLiftPct != null && (
            <p className="text-xs text-brand-accent">
              Historical lift: +{alert.historicalLiftPct}%
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
