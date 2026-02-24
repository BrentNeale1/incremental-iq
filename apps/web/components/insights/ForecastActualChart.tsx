'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart';

export interface ForecastActualPoint {
  date: string;
  forecast: number;    // Prophet baseline / predicted value
  actual: number;      // Observed metric value
  divergence?: number; // abs(actual - forecast) / forecast, for highlighting
}

interface ForecastActualChartProps {
  data: ForecastActualPoint[];
  isLoading: boolean;
  height?: number;
}

const chartConfig: ChartConfig = {
  forecast: {
    label: 'Prophet Forecast',
    color: 'var(--color-muted-foreground)',
  },
  actual: {
    label: 'Actual',
    color: 'var(--color-brand-accent)',
  },
};

const DIVERGENCE_THRESHOLD = 0.15; // 15% divergence triggers highlight

/**
 * ForecastActualChart — overlay chart showing Prophet forecast (dashed) vs actual (solid).
 *
 * Divergence is highlighted where actual significantly deviates from forecast (>15%).
 * Uses Recharts LineChart with dual series and ReferenceLine for divergence zones.
 *
 * Per design spec: "Forecast vs actual overlays with divergence highlighting."
 */
export function ForecastActualChart({ data, isLoading, height = 280 }: ForecastActualChartProps) {
  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        Forecast data not available — requires Prophet baseline model to be run
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
    return `$${value}`;
  };

  // Find points where divergence exceeds threshold for reference lines
  const divergentDates = data
    .filter((d) => d.divergence != null && d.divergence > DIVERGENCE_THRESHOLD)
    .map((d) => d.date);

  return (
    <ChartContainer config={chartConfig} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
              const divergencePct = d.divergence != null ? `${(d.divergence * 100).toFixed(1)}%` : null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                  <p className="mb-1.5 font-medium">{formatXAxis(label as string)}</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      <span className="text-muted-foreground">Forecast:</span>
                      <span className="font-mono font-medium">{formatYAxis(d.forecast)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-brand-accent" />
                      <span className="text-muted-foreground">Actual:</span>
                      <span className="font-mono font-medium">{formatYAxis(d.actual)}</span>
                    </div>
                    {divergencePct && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Divergence:</span>
                        <span
                          className={
                            d.divergence! > DIVERGENCE_THRESHOLD
                              ? 'font-mono text-amber-600 dark:text-amber-400'
                              : 'font-mono'
                          }
                        >
                          {divergencePct}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }}
          />

          {/* Divergence reference lines */}
          {divergentDates.map((date) => (
            <ReferenceLine
              key={date}
              x={date}
              stroke="var(--color-amber-500, #f59e0b)"
              strokeWidth={1}
              strokeOpacity={0.4}
              strokeDasharray="2 2"
            />
          ))}

          {/* Forecast — dashed */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="var(--color-muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="Prophet Forecast"
          />

          {/* Actual — solid */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="var(--color-brand-accent)"
            strokeWidth={2}
            dot={false}
            name="Actual"
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
