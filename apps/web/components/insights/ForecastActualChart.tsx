'use client';

import * as React from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';

export interface ForecastActualPoint {
  date: string;
  actual?: number;         // Observed historical value
  forecast?: number;       // yhat (fitted for historical, predicted for future)
  forecastLower?: number;  // yhat_lower (confidence band bottom)
  forecastUpper?: number;  // yhat_upper (confidence band top)
  ciBase?: number;         // = forecastLower (transparent area for stacking)
  ciWidth?: number;        // = forecastUpper - forecastLower (colored area on top)
}

interface ForecastActualChartProps {
  data: ForecastActualPoint[];
  isLoading: boolean;
  height?: number;
  emptyMessage?: string;
}

const chartConfig: ChartConfig = {
  actual: {
    label: 'Actual',
    color: 'hsl(var(--chart-1))',
  },
  forecast: {
    label: 'Forecast',
    color: 'hsl(var(--chart-2))',
  },
};

/**
 * ForecastActualChart — overlay chart showing real Prophet forecast with confidence bands.
 *
 * Uses ComposedChart (same approach as ConfidenceIntervalChart.tsx):
 *   - Stacked Area for CI band (ciBase transparent + ciWidth shaded)
 *   - Solid Line for actual observed historical values
 *   - Dashed Line for Prophet forecast (fitted historical + future predictions)
 *
 * Renders empty state message when no data is available.
 * Hover tooltip shows date + actual/forecast values.
 *
 * RPRT-05: Forecast vs actual chart with Prophet confidence bands.
 */
export function ForecastActualChart({
  data,
  isLoading,
  height = 280,
  emptyMessage = 'Forecast data not available for this campaign',
}: ForecastActualChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyMessage}
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
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <ChartContainer config={chartConfig} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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

          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as ForecastActualPoint | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                  <p className="mb-1.5 font-medium">{formatXAxis(label as string)}</p>
                  <div className="space-y-1">
                    {d.actual != null && (
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" />
                        <span className="text-muted-foreground">Actual:</span>
                        <span className="font-mono font-medium">{formatYAxis(d.actual)}</span>
                      </div>
                    )}
                    {d.forecast != null && (
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[hsl(var(--chart-2))]" />
                        <span className="text-muted-foreground">Forecast:</span>
                        <span className="font-mono font-medium">{formatYAxis(d.forecast)}</span>
                      </div>
                    )}
                    {d.forecastLower != null && d.forecastUpper != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">CI:</span>
                        <span className="font-mono">
                          [{formatYAxis(d.forecastLower)}, {formatYAxis(d.forecastUpper)}]
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />

          {/* Confidence band — stacked: transparent base + shaded width (same as ConfidenceIntervalChart) */}
          <Area
            type="monotone"
            dataKey="ciBase"
            stackId="ci"
            stroke="none"
            fill="none"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="ciWidth"
            stackId="ci"
            stroke="none"
            fill="hsl(var(--chart-2))"
            fillOpacity={0.15}
            legendType="none"
          />

          {/* Actual historical — solid line */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
            name="Actual"
            connectNulls={false}
          />

          {/* Forecast (fitted + predicted) — dashed line */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="hsl(var(--chart-2))"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            dot={false}
            name="Forecast"
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
