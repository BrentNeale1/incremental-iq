'use client';

import * as React from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ActivityIcon, CheckCircleIcon, TrendingUpIcon, ClockIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { IncrementalityScore } from '@/lib/hooks/useIncrementality';

interface ModelHealthOverviewProps {
  scores: IncrementalityScore[] | undefined;
  isLoading: boolean;
}

interface MetricCard {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  valueColor?: string;
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * ModelHealthOverview — 4-card summary of aggregate model health at the top of
 * the Statistical Insights page.
 *
 * Cards:
 *   1. Average confidence across all campaigns
 *   2. Campaigns scored vs total
 *   3. Model accuracy trend (average liftMean stability)
 *   4. Last scoring run timestamp
 *
 * Per design spec: "Model health and trends overview at top."
 */
export function ModelHealthOverview({ scores, isLoading }: ModelHealthOverviewProps) {
  const cards = React.useMemo<MetricCard[]>(() => {
    if (!scores || scores.length === 0) return [];

    const adjustedScores = scores.filter((s) => s.scoreType === 'adjusted');

    // 1. Average confidence
    const confidences = adjustedScores.map((s) => s.confidence).filter((c) => c != null);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

    // 2. Campaigns scored
    const scoredCount = new Set(adjustedScores.map((s) => s.campaignId)).size;

    // 3. Average lift (accuracy proxy — higher & more stable = better)
    const lifts = adjustedScores.map((s) => s.liftMean).filter((l) => l != null && l > 0);
    const avgLift = lifts.length > 0
      ? lifts.reduce((a, b) => a + b, 0) / lifts.length
      : 0;

    // 4. Most recent scoring run
    const latestRun = adjustedScores
      .map((s) => s.scoredAt)
      .sort()
      .at(-1);

    const lastRunLabel = latestRun
      ? formatDistanceToNow(parseISO(latestRun), { addSuffix: true })
      : 'Never';

    return [
      {
        label: 'Average Confidence',
        value: pct(avgConfidence),
        sub: `Across ${confidences.length} scored campaigns`,
        icon: ActivityIcon,
        valueColor:
          avgConfidence >= 0.8
            ? 'text-emerald-600 dark:text-emerald-400'
            : avgConfidence >= 0.5
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400',
      },
      {
        label: 'Campaigns Scored',
        value: String(scoredCount),
        sub: 'Unique campaigns with model outputs',
        icon: CheckCircleIcon,
      },
      {
        label: 'Avg Incremental Lift',
        value: avgLift > 0 ? pct(avgLift) : '—',
        sub: 'Mean seasonally-adjusted lift',
        icon: TrendingUpIcon,
        valueColor: avgLift > 0 ? 'text-emerald-600 dark:text-emerald-400' : undefined,
      },
      {
        label: 'Last Scoring Run',
        value: lastRunLabel,
        sub: latestRun ? parseISO(latestRun).toLocaleDateString() : 'No data yet',
        icon: ClockIcon,
      },
    ];
  }, [scores]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No model scores available yet. Connect your ad platforms and run the scoring pipeline to
        see model health here.
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.valueColor ?? ''}`}>{card.value}</div>
              <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
