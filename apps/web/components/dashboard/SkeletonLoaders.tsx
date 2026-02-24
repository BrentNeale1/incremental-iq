import { Skeleton } from '@/components/ui/skeleton';

/**
 * SkeletonLoaders — collection of skeleton placeholder components matching
 * each dashboard page section layout.
 *
 * All use shadcn Skeleton for consistent pulsing animation.
 *
 * Progressive loading order per design spec: KPIs first → charts → tables → recommendations
 */

/**
 * KpiGridSkeleton — 4 card placeholders in a responsive grid.
 * Matches: apps/web/components/dashboard/KpiGrid.tsx layout
 */
export function KpiGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * ChartSkeleton — pulsing rectangle matching the chart area.
 * Accepts an optional height (defaults to 280px).
 */
export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <Skeleton className="w-full rounded-md" style={{ height }} />
    </div>
  );
}

/**
 * TableSkeleton — header row + 5 placeholder rows with pulsing lines.
 * Matches data tables in the performance and health pages.
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 border-b bg-muted/50 px-4 py-3">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="h-4 w-1/6" />
        <Skeleton className="ml-auto h-4 w-1/6" />
      </div>
      {/* Data rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="h-4 w-1/6" />
            <Skeleton className="ml-auto h-4 w-1/6" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * RecommendationCardSkeleton — card placeholder with left border accent.
 * Matches: apps/web/components/recommendations/RecommendationCard.tsx
 */
export function RecommendationCardSkeleton() {
  return (
    <div className="rounded-lg border-l-4 border border-l-muted bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-28 rounded-md mt-2" />
    </div>
  );
}

/**
 * SidebarSkeleton — nav item placeholders for sidebar loading state.
 */
export function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-1 p-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}

/**
 * TimelineSkeleton — horizontal bar with dot placeholders for seasonal timeline.
 * Matches: apps/web/components/seasonality/SeasonalTimeline.tsx
 */
export function TimelineSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6">
      {/* Timeline bar */}
      <div className="relative h-2 w-full rounded-full bg-muted mb-6">
        <Skeleton className="h-2 w-full rounded-full" />
        {/* Dot placeholders */}
        {[15, 35, 55, 75].map((pct) => (
          <div
            key={pct}
            className="absolute -top-2 flex flex-col items-center gap-2"
            style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}
          >
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-16 mt-4" />
          </div>
        ))}
      </div>
      {/* Labels row */}
      <div className="flex justify-between mt-8">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-3 w-14" />
        ))}
      </div>
    </div>
  );
}

/**
 * RecommendationGridSkeleton — 3 recommendation card skeletons in a grid.
 */
export function RecommendationGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <RecommendationCardSkeleton key={i} />
      ))}
    </div>
  );
}
