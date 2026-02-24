'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { SeasonalEvent, HistoricalPerformance } from '@/lib/hooks/useSeasonality';

interface HistoricalComparisonProps {
  upcomingEvents: SeasonalEvent[];
  historicalData: HistoricalPerformance[];
  isLoading?: boolean;
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    notation: value >= 10_000 ? 'compact' : 'standard',
    compactDisplay: 'short',
  }).format(value);
}

function fmtDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'MMM d');
  } catch {
    return dateStr;
  }
}

/**
 * Groups historical data by event name, returning the most recent year's record.
 */
function groupHistoricalByEvent(
  historical: HistoricalPerformance[],
): Map<string, HistoricalPerformance> {
  const byEvent = new Map<string, HistoricalPerformance>();
  for (const record of historical) {
    const existing = byEvent.get(record.eventName);
    if (!existing || record.year > existing.year) {
      byEvent.set(record.eventName, record);
    }
  }
  return byEvent;
}

/**
 * HistoricalComparison — year-over-year comparison for upcoming seasonal events.
 *
 * For each upcoming event, shows:
 *   Last year: spend, revenue, ROAS during event window
 *   This year: "No forecast yet — data accumulates after event"
 *
 * Per user decision: "Last BFCM you spent $X and got Y incremental revenue, this year we project Z"
 * If no historical data: shows first-year placeholder message.
 */
export function HistoricalComparison({
  upcomingEvents,
  historicalData,
  isLoading = false,
}: HistoricalComparisonProps) {
  const historicalByEvent = React.useMemo(
    () => groupHistoricalByEvent(historicalData),
    [historicalData],
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (upcomingEvents.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Year-over-Year Comparison</CardTitle>
        <p className="text-xs text-muted-foreground">
          Last year&apos;s performance during each upcoming event window vs. this year&apos;s outlook.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-0">Event</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Last Year Spend</TableHead>
              <TableHead className="text-right">Last Year Revenue</TableHead>
              <TableHead className="text-right">Last Year ROAS</TableHead>
              <TableHead>This Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {upcomingEvents.map((event) => {
              const historical = historicalByEvent.get(event.name);
              const windowBefore = parseInt(event.windowBefore ?? '7', 10);
              const windowAfter = parseInt(event.windowAfter ?? '7', 10);
              const windowDesc = `${windowBefore}d before – ${windowAfter}d after`;

              let formattedDate = event.eventDate;
              try {
                formattedDate = format(parseISO(event.eventDate), 'MMM d, yyyy');
              } catch {
                // keep raw
              }

              if (!historical) {
                return (
                  <TableRow key={event.id}>
                    <TableCell className="pl-0 font-medium">{event.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formattedDate}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{windowDesc}</TableCell>
                    <TableCell colSpan={3} className="text-center text-xs text-muted-foreground italic">
                      No prior data — first {event.name} analysis available next year
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        First year
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <TableRow key={event.id}>
                  <TableCell className="pl-0 font-medium">{event.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formattedDate}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <span title={`${fmtDate(historical.periodFrom)} – ${fmtDate(historical.periodTo)}`}>
                      {windowDesc}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {fmtCurrency(historical.totalSpend)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {fmtCurrency(historical.totalRevenue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {historical.roas > 0 ? `${historical.roas.toFixed(2)}x` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Forecast TBD
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
