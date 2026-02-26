'use client';

import { TrendingDown, TrendingUp, GripVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/lib/store/dashboard';

export type KpiMetricKey =
  | 'spend'
  | 'revenue'
  | 'roas'
  | 'incremental_revenue'
  | 'lift_pct'
  | 'avg_confidence';

/**
 * Formats a raw numeric value with currency/multiplier abbreviations.
 * Examples: 12500 -> "$12.5K", 3.25 -> "3.3x", 42.5 -> "42.5%"
 */
export function formatKpiValue(key: KpiMetricKey, value: number): string {
  switch (key) {
    case 'roas':
      return `${value.toFixed(2)}x`;
    case 'lift_pct':
      return `${value.toFixed(1)}%`;
    case 'avg_confidence':
      return `${(value * 100).toFixed(0)}%`;
    case 'spend':
    case 'revenue':
    case 'incremental_revenue': {
      if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
      return `$${value.toFixed(0)}`;
    }
    default:
      return value.toString();
  }
}

export interface KpiCardProps {
  metricKey: KpiMetricKey;
  value: number;
  delta?: number;
  deltaPct?: number;
  /** When true, shows a drag handle grip icon */
  isDragging?: boolean;
  className?: string;
}

/**
 * KpiCard — displays a single KPI metric with optional period-over-period delta.
 *
 * Equal-sized cards — layout is controlled by KpiGrid.
 * Delta: green arrow up for positive, red arrow down for negative.
 *
 * Labels are dynamic based on tenant outcomeMode (ecommerce vs lead_gen).
 */
export function KpiCard({
  metricKey,
  value,
  delta,
  deltaPct,
  isDragging = false,
  className,
}: KpiCardProps) {
  const outcomeMode = useDashboardStore((s) => s.outcomeMode);

  const METRIC_LABELS: Record<KpiMetricKey, string> = {
    spend: 'Total Spend',
    revenue: outcomeMode === 'lead_gen' ? 'Leads' : 'Revenue',
    roas: outcomeMode === 'lead_gen' ? 'Cost per Lead' : 'ROAS',
    incremental_revenue: outcomeMode === 'lead_gen' ? 'Incremental Leads' : 'Incremental Revenue',
    lift_pct: 'Avg Lift %',
    avg_confidence: 'Avg Confidence',
  };

  const label = METRIC_LABELS[metricKey];
  const formattedValue = formatKpiValue(metricKey, value);

  const hasDelta = delta !== undefined && deltaPct !== undefined;
  const isPositive = (delta ?? 0) >= 0;

  return (
    <Card
      className={cn(
        'relative select-none',
        isDragging && 'shadow-lg ring-2 ring-brand-accent/50',
        className,
      )}
    >
      {/* Drag handle indicator */}
      <div className="absolute right-2 top-2 text-muted-foreground/40">
        <GripVertical className="h-4 w-4" />
      </div>

      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>

      <CardContent className="pb-4">
        <p className="text-2xl font-bold tabular-nums">{formattedValue}</p>

        {hasDelta && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-medium',
              isPositive ? 'text-brand-success' : 'text-brand-danger',
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            <span>
              {isPositive ? '+' : ''}
              {deltaPct!.toFixed(1)}% vs prior period
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
