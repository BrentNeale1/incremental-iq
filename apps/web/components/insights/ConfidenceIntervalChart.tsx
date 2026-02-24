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
import type { IncrementalityScore } from '@/lib/hooks/useIncrementality';

interface ConfidenceIntervalChartProps {
  scores: IncrementalityScore[] | undefined;
  isLoading: boolean;
  height?: number;
}

interface ChartPoint {
  date: string;
  liftMean: number;
  liftLower: number;
  liftUpper: number;
  // For the stacked CI band: [floor, bandHeight]
  ciBase: number;
  ciBand: number;
  confidence: number;
}

const chartConfig: ChartConfig = {
  liftMean: {
    label: 'Lift Mean',
    color: 'hsl(var(--brand-primary, 221 83% 53%))',
  },
};

/**
 * ConfidenceIntervalChart — shows liftMean as a line with shaded CI band (liftLower–liftUpper).
 *
 * Uses Recharts ComposedChart with:
 *   - Stacked Area for CI band (ciBase transparent + ciBand with gradient)
 *   - Line for liftMean
 *
 * Data is aggregated across all campaigns by date (average per scoring date).
 * Tooltip shows exact liftMean, liftLower, liftUpper, and confidence.
 */
export function ConfidenceIntervalChart({
  scores,
  isLoading,
  height = 280,
}: ConfidenceIntervalChartProps) {
  const chartData = React.useMemo<ChartPoint[]>(() => {
    if (!scores || scores.length === 0) return [];

    // Group by scoredAt — average across campaigns for aggregate view
    const byDate = new Map<string, { sumMean: number; sumLower: number; sumUpper: number; sumConf: number; count: number }>();
    for (const s of scores.filter((s) => s.scoreType === 'adjusted')) {
      const existing = byDate.get(s.scoredAt) ?? { sumMean: 0, sumLower: 0, sumUpper: 0, sumConf: 0, count: 0 };
      byDate.set(s.scoredAt, {
        sumMean: existing.sumMean + s.liftMean,
        sumLower: existing.sumLower + s.liftLower,
        sumUpper: existing.sumUpper + s.liftUpper,
        sumConf: existing.sumConf + s.confidence,
        count: existing.count + 1,
      });
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, agg]) => {
        const liftLower = agg.sumLower / agg.count;
        const liftUpper = agg.sumUpper / agg.count;
        return {
          date,
          liftMean: agg.sumMean / agg.count,
          liftLower,
          liftUpper,
          // Stacked CI band: ciBase = liftLower, ciBand = width of CI
          ciBase: liftLower,
          ciBand: Math.max(0, liftUpper - liftLower),
          confidence: agg.sumConf / agg.count,
        };
      });
  }, [scores]);

  if (isLoading) {
    return <Skeleton className="w-full" style={{ height }} />;
  }

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height }}
      >
        No incrementality scores available yet
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

  const formatYAxis = (value: number) => `${(value * 100).toFixed(0)}pp`;

  return (
    <ChartContainer config={chartConfig} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ciBandGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
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
            width={52}
          />

          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as ChartPoint | undefined;
              if (!d) return null;
              return (
                <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-xl">
                  <p className="mb-1.5 font-medium">{formatXAxis(label as string)}</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Lift Mean:</span>
                      <span className="font-mono font-medium">{(d.liftMean * 100).toFixed(2)}pp</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">CI:</span>
                      <span className="font-mono">
                        [{(d.liftLower * 100).toFixed(2)}pp, {(d.liftUpper * 100).toFixed(2)}pp]
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Confidence:</span>
                      <span className="font-mono">{(d.confidence * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            }}
          />

          {/* CI band — stacked: transparent base + colored band width */}
          <Area
            type="monotone"
            dataKey="ciBase"
            stackId="ci"
            stroke="none"
            fill="transparent"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="ciBand"
            stackId="ci"
            stroke="none"
            fill="url(#ciBandGradient)"
            legendType="none"
          />

          {/* Lift mean line */}
          <Line
            type="monotone"
            dataKey="liftMean"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3b82f6' }}
            activeDot={{ r: 5 }}
            name="Lift Mean"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
