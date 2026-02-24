'use client';

import * as React from 'react';
import { CalendarIcon } from 'lucide-react';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import type { DateRange as DayPickerDateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useDashboardStore, type DateRange } from '@/lib/store/dashboard';
import { cn } from '@/lib/utils';

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '14d', days: 14 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

interface DateRangePickerProps {
  /** When true, updates the comparison range instead of the primary range */
  isComparison?: boolean;
  className?: string;
}

/**
 * DateRangePicker — preset buttons + custom two-calendar range selector.
 *
 * Preset buttons: Last 7 / 14 / 30 / 90 days
 * Custom: shadcn Calendar in range mode inside a Popover
 *
 * State stored in Zustand dashboard store (not local state) so the selected
 * range is shared across all dashboard pages.
 */
export function DateRangePicker({ isComparison = false, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  const dateRange = useDashboardStore((s) => s.dateRange);
  const comparisonRange = useDashboardStore((s) => s.comparisonRange);
  const setDateRange = useDashboardStore((s) => s.setDateRange);
  const setComparisonRange = useDashboardStore((s) => s.setComparisonRange);

  const activeRange = isComparison ? comparisonRange : dateRange;
  const setActiveRange = isComparison ? setComparisonRange : setDateRange;

  function handlePreset(days: number) {
    const to = endOfDay(new Date());
    const from = startOfDay(subDays(new Date(), days - 1));
    setActiveRange({ from, to });
    setOpen(false);
  }

  function handleCalendarSelect(range: DayPickerDateRange | undefined) {
    if (!range) return;
    if (range.from && range.to) {
      setActiveRange({
        from: startOfDay(range.from),
        to: endOfDay(range.to),
      });
      setOpen(false);
    } else if (range.from) {
      // Partial selection — keep popover open for second date
      setActiveRange({
        from: startOfDay(range.from),
        to: endOfDay(range.from),
      });
    }
  }

  const displayLabel = activeRange
    ? `${format(activeRange.from, 'MMM d')} – ${format(activeRange.to, 'MMM d, yyyy')}`
    : 'Select range';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Preset buttons */}
      {PRESETS.map((preset) => (
        <Button
          key={preset.days}
          variant="outline"
          size="sm"
          className="h-8 px-2 text-xs"
          onClick={() => handlePreset(preset.days)}
        >
          {preset.label}
        </Button>
      ))}

      {/* Custom date range popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{displayLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={
              activeRange
                ? { from: activeRange.from, to: activeRange.to }
                : undefined
            }
            onSelect={handleCalendarSelect}
            numberOfMonths={2}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
