'use client';

import { subDays, startOfDay, endOfDay } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { useDashboardStore } from '@/lib/store/dashboard';

/**
 * ComparisonToggle — enables a second date range for period-over-period KPI deltas.
 *
 * When toggled on:
 *   1. Sets comparisonEnabled = true in Zustand store
 *   2. Auto-calculates the comparison period (previous window of equal length)
 *   3. Shows a secondary DateRangePicker for manual override
 *
 * Default comparison logic: if main period is N days, compare to the
 * N days immediately preceding it.
 */
export function ComparisonToggle() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  const comparisonEnabled = useDashboardStore((s) => s.comparisonEnabled);
  const setComparisonEnabled = useDashboardStore((s) => s.setComparisonEnabled);
  const setComparisonRange = useDashboardStore((s) => s.setComparisonRange);

  function handleToggle(checked: boolean) {
    setComparisonEnabled(checked);

    if (checked) {
      // Auto-calculate comparison: previous period of equal length
      const mainDays = Math.round(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24),
      );
      const compareTo = endOfDay(subDays(dateRange.from, 1));
      const compareFrom = startOfDay(subDays(compareTo, mainDays));
      setComparisonRange({ from: compareFrom, to: compareTo });
    } else {
      setComparisonRange(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <Switch
          id="comparison-toggle"
          checked={comparisonEnabled}
          onCheckedChange={handleToggle}
          className="data-[state=checked]:bg-brand-accent"
        />
        <Label htmlFor="comparison-toggle" className="cursor-pointer text-xs">
          Compare
        </Label>
      </div>
      {comparisonEnabled && (
        <DateRangePicker isComparison className="ml-1" />
      )}
    </div>
  );
}
