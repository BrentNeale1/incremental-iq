'use client';

import * as React from 'react';
import { format, parseISO, subMonths } from 'date-fns';
import { TrendingUpIcon, StarIcon, ZapIcon, TargetIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { IncrementalityScore } from '@/lib/hooks/useIncrementality';

interface ProgressionViewProps {
  scores: IncrementalityScore[] | undefined;
  isLoading: boolean;
}

interface Milestone {
  date: string;
  label: string;
  description: string;
  type: 'first_run' | 'high_confidence' | 'improvement' | 'target';
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * ProgressionView — 12-month timeline of model accuracy and confidence improvements.
 *
 * Shows:
 *   - Historical scoring run dots by month
 *   - Key milestones: first scoring run, first high-confidence result, significant lift increases
 *   - Trend line showing how average confidence has evolved
 *
 * Per design spec: "Long-range progression view — last 12 months performance progression,
 * experiment history, model improvement over time."
 */
export function ProgressionView({ scores, isLoading }: ProgressionViewProps) {
  const { milestones, monthlyData } = React.useMemo(() => {
    if (!scores || scores.length === 0) {
      return { milestones: [], monthlyData: [] };
    }

    const adjusted = scores.filter((s) => s.scoreType === 'adjusted');
    const cutoff = subMonths(new Date(), 12);

    // Filter to last 12 months
    const recent = adjusted.filter((s) => {
      try {
        return parseISO(s.scoredAt) >= cutoff;
      } catch {
        return false;
      }
    });

    // Build monthly aggregates
    const byMonth = new Map<string, { confidences: number[]; lifts: number[]; count: number }>();
    for (const s of recent) {
      try {
        const monthKey = format(parseISO(s.scoredAt), 'yyyy-MM');
        const existing = byMonth.get(monthKey) ?? { confidences: [], lifts: [], count: 0 };
        byMonth.set(monthKey, {
          confidences: [...existing.confidences, s.confidence],
          lifts: [...existing.lifts, s.liftMean],
          count: existing.count + 1,
        });
      } catch {
        // skip invalid dates
      }
    }

    const monthlyData = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, agg]) => ({
        month,
        avgConfidence: agg.confidences.reduce((a, b) => a + b, 0) / agg.confidences.length,
        avgLift: agg.lifts.filter((l) => l > 0).reduce((a, b) => a + b, 0) / Math.max(1, agg.lifts.filter((l) => l > 0).length),
        scoringRuns: agg.count,
      }));

    // Derive milestones
    const derived: Milestone[] = [];

    if (adjusted.length > 0) {
      const firstRun = adjusted.sort((a, b) => a.scoredAt.localeCompare(b.scoredAt))[0];
      derived.push({
        date: firstRun.scoredAt,
        label: 'First Scoring Run',
        description: 'Model began analyzing campaign incrementality',
        type: 'first_run',
        icon: ZapIcon,
      });

      const firstHighConf = adjusted.find((s) => s.confidence >= 0.75);
      if (firstHighConf) {
        derived.push({
          date: firstHighConf.scoredAt,
          label: 'First High-Confidence Result',
          description: `${firstHighConf.campaignName} reached ${(firstHighConf.confidence * 100).toFixed(0)}% confidence`,
          type: 'high_confidence',
          icon: StarIcon,
        });
      }

      // Find month with best avg confidence
      const bestMonth = monthlyData.reduce(
        (best, m) => (!best || m.avgConfidence > best.avgConfidence ? m : best),
        null as (typeof monthlyData)[0] | null,
      );
      if (bestMonth && bestMonth.avgConfidence >= 0.7) {
        derived.push({
          date: `${bestMonth.month}-01`,
          label: 'Peak Model Accuracy',
          description: `Average confidence reached ${(bestMonth.avgConfidence * 100).toFixed(0)}% in ${format(parseISO(`${bestMonth.month}-01`), 'MMMM yyyy')}`,
          type: 'improvement',
          icon: TrendingUpIcon,
        });
      }
    }

    return { milestones: derived, monthlyData };
  }, [scores]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (monthlyData.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No historical data yet — scoring history will appear here after the first model run.
      </div>
    );
  }

  const maxConfidence = Math.max(...monthlyData.map((m) => m.avgConfidence), 0.01);

  return (
    <div className="space-y-6">
      {/* Monthly confidence bar chart */}
      <div>
        <p className="mb-3 text-xs font-medium text-muted-foreground">Monthly Average Confidence (Last 12 Months)</p>
        <div className="flex items-end gap-1.5" style={{ height: 80 }}>
          {monthlyData.map((m) => {
            const heightPct = (m.avgConfidence / maxConfidence) * 100;
            const label = format(parseISO(`${m.month}-01`), 'MMM');
            return (
              <div
                key={m.month}
                className="group flex flex-1 flex-col items-center gap-1"
                title={`${format(parseISO(`${m.month}-01`), 'MMMM yyyy')}: ${(m.avgConfidence * 100).toFixed(1)}% avg confidence, ${m.scoringRuns} run${m.scoringRuns !== 1 ? 's' : ''}`}
              >
                <div className="relative flex w-full flex-1 items-end justify-center">
                  <div
                    className={cn(
                      'w-full rounded-t transition-all',
                      m.avgConfidence >= 0.75
                        ? 'bg-emerald-500 dark:bg-emerald-600'
                        : m.avgConfidence >= 0.5
                          ? 'bg-amber-400 dark:bg-amber-500'
                          : 'bg-slate-300 dark:bg-slate-600',
                    )}
                    style={{ height: `${heightPct}%`, minHeight: 4 }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Milestone timeline */}
      {milestones.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-medium text-muted-foreground">Key Milestones</p>
          <div className="relative space-y-4 pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-border">
            {milestones
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((m) => {
                const Icon = m.icon;
                const colorMap: Record<Milestone['type'], string> = {
                  first_run: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                  high_confidence: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
                  improvement: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                  target: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
                };
                return (
                  <div key={`${m.type}-${m.date}`} className="flex items-start gap-3">
                    <div
                      className={cn(
                        'absolute -left-0 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                        colorMap[m.type],
                      )}
                    >
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="ml-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{m.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {format(parseISO(m.date), 'MMM d, yyyy')}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
