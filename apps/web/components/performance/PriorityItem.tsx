'use client';

import * as React from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/lib/recommendations/types';

interface PriorityItemProps {
  recommendation: Recommendation;
}

const ACTION_CONFIG = {
  scale_up: {
    color: 'bg-emerald-500',
    label: 'Scale',
    badgeVariant: 'default' as const,
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  },
  watch: {
    color: 'bg-amber-500',
    label: 'Watch',
    badgeVariant: 'secondary' as const,
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  },
  investigate: {
    color: 'bg-red-500',
    label: 'Investigate',
    badgeVariant: 'destructive' as const,
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
} as const;

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  google_ads: 'Google',
  shopify: 'Shopify',
};

/**
 * Generates the one-line action summary for a recommendation.
 */
function buildActionSummary(rec: Recommendation): string {
  switch (rec.action) {
    case 'scale_up': {
      if (rec.budgetIncreasePct && rec.expectedIncrementalRevenue) {
        const pct = Math.round(rec.budgetIncreasePct);
        const revenue = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
          notation: 'compact',
          compactDisplay: 'short',
        }).format(rec.expectedIncrementalRevenue);
        return `Scale up ${pct}% — expected +${revenue}`;
      }
      return 'Scale up — strong incrementality signal';
    }
    case 'watch':
      return 'Watch — confidence building';
    case 'investigate':
      return 'Investigate — insufficient data';
    default:
      return 'Review campaign';
  }
}

/**
 * PriorityItem — single campaign action card in the priority queue.
 *
 * Displays:
 * - Left color bar (green/amber/red by action type)
 * - Campaign name + platform badge
 * - One-line action summary
 * - Right chevron (placeholder for future campaign detail link)
 */
export function PriorityItem({ recommendation: rec }: PriorityItemProps) {
  const config = ACTION_CONFIG[rec.action];
  const platformLabel = PLATFORM_LABELS[rec.platform.toLowerCase()] ?? rec.platform;
  const summary = buildActionSummary(rec);

  return (
    <div className="group flex items-center gap-0 rounded-lg border bg-card transition-colors hover:bg-muted/50">
      {/* Left color indicator */}
      <div className={cn('w-1 self-stretch rounded-l-lg', config.color)} aria-hidden="true" />

      {/* Content */}
      <div className="flex flex-1 items-center gap-3 px-4 py-3">
        {/* Campaign info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {rec.campaignName}
            </span>
            <Badge
              variant="outline"
              className={cn('shrink-0 px-1.5 py-0 text-xs', config.badgeClass)}
            >
              {platformLabel}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{summary}</p>
        </div>

        {/* Action label + arrow */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'text-xs font-semibold',
              rec.action === 'scale_up' && 'text-emerald-600 dark:text-emerald-400',
              rec.action === 'watch' && 'text-amber-600 dark:text-amber-400',
              rec.action === 'investigate' && 'text-red-600 dark:text-red-400',
            )}
          >
            {config.label}
          </span>
          <ChevronRightIcon
            className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}
