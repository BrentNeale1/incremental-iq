'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/lib/recommendations/types';

/** Maps action type to left-border color class */
const ACTION_BORDER_COLORS: Record<string, string> = {
  scale_up: 'border-l-4 border-l-brand-success',
  watch: 'border-l-4 border-l-brand-warning',
  investigate: 'border-l-4 border-l-brand-danger',
};

/** Maps platform ID to display name */
function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    meta: 'Meta',
    google: 'Google',
    shopify: 'Shopify',
  };
  return labels[platform.toLowerCase()] ?? platform;
}

/** Returns a human-readable summary for a recommendation */
function buildSummary(rec: Recommendation): string {
  switch (rec.action) {
    case 'scale_up': {
      const pct = rec.budgetIncreasePct ?? 0;
      const current = rec.currentDailySpend?.toFixed(0) ?? '—';
      const proposed = rec.proposedDailySpend?.toFixed(0) ?? '—';
      const weeks = rec.durationWeeks ?? 3;
      const expected = rec.expectedIncrementalRevenue
        ? rec.expectedIncrementalRevenue >= 1000
          ? `$${(rec.expectedIncrementalRevenue / 1000).toFixed(1)}K`
          : `$${rec.expectedIncrementalRevenue.toFixed(0)}`
        : '—';
      return `Increase budget by ${pct}% ($${current}/day → $${proposed}/day) for ${weeks} weeks — expected +${expected} incremental revenue`;
    }
    case 'watch': {
      const days =
        rec.nextAnalysisDate
          ? Math.ceil(
              (new Date(rec.nextAnalysisDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            )
          : 7;
      const daysLabel = days <= 0 ? 'soon' : `in ${days} day${days === 1 ? '' : 's'}`;
      return `Confidence building — next analysis ${daysLabel}`;
    }
    case 'investigate':
      return 'Insufficient data — connect more sources or extend time range';
    default:
      return 'See recommendation details';
  }
}

export interface RecommendationCardProps {
  recommendation: Recommendation;
  className?: string;
}

/**
 * RecommendationCard — executive (business owner) view.
 *
 * Shown when viewMode === 'executive'.
 * Displays: platform badge, campaign name, single-line summary with specific numbers.
 * Left border color: green (scale_up), yellow (watch), red (investigate).
 */
export function RecommendationCard({ recommendation: rec, className }: RecommendationCardProps) {
  const borderClass = ACTION_BORDER_COLORS[rec.action] ?? '';

  return (
    <Card className={cn('overflow-hidden', borderClass, className)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-tight">{rec.campaignName}</p>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {platformLabel(rec.platform)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        <p className="text-sm text-muted-foreground">{buildSummary(rec)}</p>
      </CardContent>
    </Card>
  );
}
