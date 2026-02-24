'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/lib/recommendations/types';

const ACTION_BORDER_COLORS: Record<string, string> = {
  scale_up: 'border-l-4 border-l-brand-success',
  watch: 'border-l-4 border-l-brand-warning',
  investigate: 'border-l-4 border-l-brand-danger',
};

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    meta: 'Meta',
    google: 'Google',
    shopify: 'Shopify',
  };
  return labels[platform.toLowerCase()] ?? platform;
}

function confidenceColor(level: string): string {
  switch (level) {
    case 'high': return 'text-brand-success';
    case 'medium': return 'text-brand-warning';
    case 'low': return 'text-brand-danger';
    default: return 'text-muted-foreground';
  }
}

export interface RecommendationAnalystCardProps {
  recommendation: Recommendation;
  className?: string;
}

/**
 * RecommendationAnalystCard — analyst view with full statistical detail.
 *
 * Shown when viewMode === 'analyst'.
 * Extends the executive card with:
 *   - Lift CI range (liftMean ± liftLower–liftUpper)
 *   - Confidence % and level
 *   - Saturation %
 *   - Expandable methodology section (Hill curve params alpha/mu/gamma)
 */
export function RecommendationAnalystCard({
  recommendation: rec,
  className,
}: RecommendationAnalystCardProps) {
  const borderClass = ACTION_BORDER_COLORS[rec.action] ?? '';

  const confidencePct = rec.confidence != null
    ? `${(rec.confidence * 100).toFixed(0)}%`
    : '—';

  const liftRange =
    rec.liftMean != null
      ? `${(rec.liftMean * 100).toFixed(1)}% [${rec.liftLower != null ? (rec.liftLower * 100).toFixed(1) : '—'}%–${rec.liftUpper != null ? (rec.liftUpper * 100).toFixed(1) : '—'}% CI]`
      : '—';

  const saturation = rec.saturationPct != null
    ? `${(rec.saturationPct * 100).toFixed(0)}%`
    : '—';

  return (
    <Card className={cn('overflow-hidden', borderClass, className)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold leading-tight">{rec.campaignName}</p>
            <p
              className={cn(
                'mt-0.5 text-xs font-medium capitalize',
                confidenceColor(rec.confidenceLevel),
              )}
            >
              {rec.confidenceLevel} confidence
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {platformLabel(rec.platform)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* Primary statistical metrics */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Confidence</p>
            <p className="font-mono font-semibold">{confidencePct}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lift (95% CI)</p>
            <p className="font-mono font-semibold">{liftRange}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Saturation</p>
            <p className="font-mono font-semibold">{saturation}</p>
          </div>
        </div>

        {/* Scale-up budget detail */}
        {rec.action === 'scale_up' && rec.budgetIncreasePct != null && (
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
            <span className="font-medium">Budget:</span>{' '}
            +{rec.budgetIncreasePct}% (${rec.currentDailySpend?.toFixed(0) ?? '—'}/day →{' '}
            ${rec.proposedDailySpend?.toFixed(0) ?? '—'}/day) for{' '}
            {rec.durationWeeks ?? 3} weeks
          </div>
        )}

        {/* Expandable methodology section */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full justify-between px-0 text-xs text-muted-foreground hover:text-foreground"
            >
              <span>Methodology</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-2 font-mono text-xs text-muted-foreground">
              <p>Model: Bayesian MMM (CausalPy ITS)</p>
              <p>Scoring: Hill curve saturation fit</p>
              {rec.action === 'scale_up' && (
                <>
                  <p>Score type: adjusted (seasonal)</p>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
