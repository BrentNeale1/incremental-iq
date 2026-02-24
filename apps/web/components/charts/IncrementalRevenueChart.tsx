'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface TimeSeriesDataPoint {
  date: string;    // ISO date string, e.g. "2025-01-15"
  value: number;   // Incremental revenue amount
  comparisonValue?: number; // Optional comparison period value
}

export interface IncrementalRevenueChartProps {
  data: TimeSeriesDataPoint[];
  comparisonEnabled?: boolean;
  isLoading?: boolean;
  height?: number;
}

const chartConfig: ChartConfig = {
  value: {
    label: 'Incremental Revenue',
    color: 'var(--color-brand-accent)',
  },
  comparisonValue: {
    label: 'Prior Period',
    color: 'var(--color-muted-foreground)',
  },
};

/**
 * IncrementalRevenueChart — hero area chart on the Executive Overview page.
 *
 * Uses shadcn ChartContainer + Recharts AreaChart.
 * Gradient fill: SVG linearGradient from brand accent at 80% opacity down to 10%.
 * When comparison is enabled, overlays a second area in a lighter shade.
 *
 * RESEARCH.md Pattern 5: gradient fill is defined inline as SVG defs inside the chart.
 */
export function IncrementalRevenueChart({
  data,
  comparisonEnabled = false,
  isLoading = false,
  height = 280,
}: IncrementalRevenueChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No data available for this period
      </div>
    );
  }

  const formatXAxis = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'MMM d');
    } catch {
      return dateStr;
    }
  };

  const formatYAxis = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <ChartContainer config={chartConfig} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {/* Primary gradient — brand accent color */}
            <linearGradient id="gradientPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-brand-accent)" stopOpacity={0.8} />
              <stop offset="95%" stopColor="var(--color-brand-accent)" stopOpacity={0.1} />
            </linearGradient>
            {/* Comparison gradient — muted foreground */}
            <linearGradient id="gradientComparison" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-muted-foreground)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--color-muted-foreground)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />

          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={60}
          />

          <ChartTooltip content={<ChartTooltipContent />} />

          {/* Primary area */}
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-brand-accent)"
            strokeWidth={2}
            fill="url(#gradientPrimary)"
          />

          {/* Comparison overlay (only when comparison is enabled) */}
          {comparisonEnabled && (
            <Area
              type="monotone"
              dataKey="comparisonValue"
              stroke="var(--color-muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill="url(#gradientComparison)"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
