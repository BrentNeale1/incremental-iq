'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { useDashboardStore } from '@/lib/store/dashboard';

export interface PlatformDataPoint {
  platform: string;  // 'Meta' | 'Google' | 'Shopify'
  spend: number;
  revenue: number;
  incrementalRevenue: number;
}

export interface PlatformComparisonChartProps {
  data: PlatformDataPoint[];
  isLoading?: boolean;
  height?: number;
}

const PLATFORM_COLORS: Record<string, string> = {
  meta: '#1877F2',
  google: '#EA4335',
  shopify: '#95BF47',
  Meta: '#1877F2',
  Google: '#EA4335',
  Shopify: '#95BF47',
};

/**
 * PlatformComparisonChart — grouped bar chart comparing spend, revenue,
 * and incremental revenue across ad platforms.
 *
 * Uses shadcn ChartContainer + Recharts BarChart.
 * Rounded bars (radius prop) per design spec.
 * Color-coded per platform.
 *
 * Chart labels are dynamic based on tenant outcomeMode (ecommerce vs lead_gen).
 */
export function PlatformComparisonChart({
  data,
  isLoading = false,
  height = 240,
}: PlatformComparisonChartProps) {
  const outcomeMode = useDashboardStore((s) => s.outcomeMode);

  const chartConfig: ChartConfig = {
    spend: {
      label: 'Spend',
      color: 'var(--color-chart-1)',
    },
    revenue: {
      label: outcomeMode === 'lead_gen' ? 'Leads' : 'Revenue',
      color: 'var(--color-chart-2)',
    },
    incrementalRevenue: {
      label: outcomeMode === 'lead_gen' ? 'Incremental Leads' : 'Incremental Revenue',
      color: 'var(--color-brand-accent)',
    },
  };

  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No platform data available
      </div>
    );
  }

  const formatValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <ChartContainer config={chartConfig} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />

          <XAxis
            dataKey="platform"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            tickFormatter={formatValue}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={60}
          />

          <ChartTooltip content={<ChartTooltipContent />} />
          <Legend />

          <Bar
            dataKey="spend"
            name="Spend"
            fill="var(--color-chart-1)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="revenue"
            name={outcomeMode === 'lead_gen' ? 'Leads' : 'Revenue'}
            fill="var(--color-chart-2)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="incrementalRevenue"
            name={outcomeMode === 'lead_gen' ? 'Incremental Leads' : 'Incremental Revenue'}
            fill="var(--color-brand-accent)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
