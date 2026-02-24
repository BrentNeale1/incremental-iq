'use client';

import { Clock, FlaskConical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/lib/recommendations/types';

export interface LowConfidenceCardProps {
  recommendation: Recommendation;
  className?: string;
}

/**
 * LowConfidenceCard — shown when confidenceLevel is 'low' or 'insufficient'.
 *
 * Per RECC-06 (locked user decision):
 *   PRIMARY path (prominent): "Analysis needs more data — next scoring run: {date}"
 *   SECONDARY path (collapsible): "Can't wait? Run a holdout test"
 *
 * Holdout test is NEVER the first option. It is presented only as a secondary
 * alternative below the primary "wait for data" path.
 */
export function LowConfidenceCard({ recommendation: rec, className }: LowConfidenceCardProps) {
  const nextDate = rec.nextAnalysisDate
    ? parseISO(rec.nextAnalysisDate)
    : null;

  const nextDateLabel = nextDate
    ? format(nextDate, 'MMM d, yyyy')
    : 'within 7 days';

  const countdown = nextDate
    ? formatDistanceToNow(nextDate, { addSuffix: true })
    : 'soon';

  const holdout = rec.holdoutTestDesign;

  return (
    <Card className={cn('overflow-hidden border-l-4 border-l-muted-foreground/30', className)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <CardTitle className="text-sm font-semibold">{rec.campaignName}</CardTitle>
            <p className="text-xs text-muted-foreground capitalize">
              {rec.platform} · {rec.confidenceLevel} confidence
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* PRIMARY path — "wait for data" */}
        <div className="rounded-md bg-muted/60 px-3 py-2.5 text-sm">
          <p className="font-medium">Analysis needs more data</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Next scoring run: <span className="font-medium text-foreground">{nextDateLabel}</span>{' '}
            ({countdown})
          </p>
        </div>

        {/* SECONDARY path — holdout test option (only if holdoutTestDesign is present) */}
        {holdout && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-between px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <div className="flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5" />
                  <span>Alternative: Holdout Test</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 rounded-md border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  Can&apos;t wait? Run a {holdout.holdbackPct}% holdout test
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  <li>Duration: {holdout.durationWeeks} weeks</li>
                  <li>
                    Sample size: ~{holdout.estimatedSampleSize.toLocaleString()} impressions
                  </li>
                  <li className="mt-1 italic">{holdout.description}</li>
                </ul>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
