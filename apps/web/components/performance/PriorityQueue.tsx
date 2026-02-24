'use client';

import * as React from 'react';
import { useRecommendations } from '@/lib/hooks/useRecommendations';
import { PriorityItem } from '@/components/performance/PriorityItem';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { Recommendation } from '@/lib/recommendations/types';

const MAX_VISIBLE = 10;

/** Priority order for sorting: investigate > scale_up > watch */
const ACTION_PRIORITY: Record<Recommendation['action'], number> = {
  investigate: 0,
  scale_up: 1,
  watch: 2,
};

interface PriorityQueueProps {
  tenantId: string | undefined;
}

/**
 * PriorityQueue — ranked list of urgent campaign actions.
 *
 * Shows recommendations sorted by urgency:
 *   investigate (red) > scale_up (green) > watch (yellow)
 *
 * Within each action tier, sorted by expectedImpact DESC.
 * Caps at 10 visible items with a "Show all" expander.
 *
 * Per user decision: "Priority queue at top — urgent campaign actions ranked: scale, watch, investigate"
 */
export function PriorityQueue({ tenantId }: PriorityQueueProps) {
  const [showAll, setShowAll] = React.useState(false);
  const { data: recommendations, isLoading, isError } = useRecommendations(tenantId);

  const sorted = React.useMemo(() => {
    if (!recommendations) return [];
    return [...recommendations].sort((a, b) => {
      const priorityDiff = ACTION_PRIORITY[a.action] - ACTION_PRIORITY[b.action];
      if (priorityDiff !== 0) return priorityDiff;
      return b.expectedImpact - a.expectedImpact;
    });
  }, [recommendations]);

  const visible = showAll ? sorted : sorted.slice(0, MAX_VISIBLE);
  const hasMore = sorted.length > MAX_VISIBLE;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Unable to load campaign actions. Retry in a moment.
      </p>
    );
  }

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No urgent actions right now — all campaigns within expected range.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map((rec) => (
        <PriorityItem key={rec.id} recommendation={rec} />
      ))}

      {hasMore && !showAll && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll(true)}
        >
          Show all {sorted.length} actions
        </Button>
      )}

      {showAll && sorted.length > MAX_VISIBLE && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll(false)}
        >
          Show fewer
        </Button>
      )}
    </div>
  );
}
