'use client';

import * as React from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardStore } from '@/lib/store/dashboard';
import { useKpis } from '@/lib/hooks/useKpis';
import { useRecommendations } from '@/lib/hooks/useRecommendations';
import { useCampaigns } from '@/lib/hooks/useCampaigns';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { IncrementalRevenueChart, type TimeSeriesDataPoint } from '@/components/charts/IncrementalRevenueChart';
import { PlatformComparisonChart, type PlatformDataPoint } from '@/components/charts/PlatformComparisonChart';
import { RecommendationCard } from '@/components/recommendations/RecommendationCard';
import { RecommendationAnalystCard } from '@/components/recommendations/RecommendationAnalystCard';
import { LowConfidenceCard } from '@/components/recommendations/LowConfidenceCard';
import { SeasonalAlertCard } from '@/components/recommendations/SeasonalAlertCard';
import { ChartSkeleton } from '@/components/dashboard/SkeletonLoaders';
import { EmptyRecommendations } from '@/components/dashboard/EmptyStates';
import { Skeleton } from '@/components/ui/skeleton';
import { useExportContext } from '@/lib/export/context';
import type { Recommendation } from '@/lib/recommendations/types';

/**
 * Derives simple daily time series from campaign rows.
 *
 * Since the campaigns API returns aggregated totals (not daily buckets),
 * we generate an evenly-distributed time series as a visualization scaffold.
 * Phase 4 Plan 04 (performance page) will wire in actual daily campaign_metrics.
 */
function buildTimeSeriesFromTotal(
  totalIncrementalRevenue: number,
  dateRange: { from: Date; to: Date },
): TimeSeriesDataPoint[] {
  const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
  if (days.length === 0 || totalIncrementalRevenue <= 0) return [];

  // Distribute revenue roughly evenly with a slight upward trend
  const avgPerDay = totalIncrementalRevenue / days.length;
  return days.map((day, i) => ({
    date: format(day, 'yyyy-MM-dd'),
    value: Math.round(avgPerDay * (0.8 + (i / days.length) * 0.4) * 100) / 100,
  }));
}

/**
 * Aggregates campaign rows by platform for the comparison chart.
 */
function buildPlatformData(campaigns: {
  platform: string;
  spend: number;
  revenue: number;
  liftMean: number | null;
}[]): PlatformDataPoint[] {
  const byPlatform = new Map<string, PlatformDataPoint>();

  for (const row of campaigns) {
    const key = row.platform.charAt(0).toUpperCase() + row.platform.slice(1);
    // Approximate: incremental revenue = revenue * lift fraction (v1 approximation)
    const rowIncrementalRevenue = row.revenue * (row.liftMean ?? 0);
    const existing = byPlatform.get(key) ?? {
      platform: key,
      spend: 0,
      revenue: 0,
      incrementalRevenue: 0,
    };
    byPlatform.set(key, {
      platform: key,
      spend: existing.spend + row.spend,
      revenue: existing.revenue + row.revenue,
      incrementalRevenue: existing.incrementalRevenue + rowIncrementalRevenue,
    });
  }

  return Array.from(byPlatform.values());
}

/**
 * CrossMarketSuggestions — shown when a market filter is active but returns no recommendations.
 *
 * Reads the full unfiltered recommendation set directly from TanStack Query cache
 * (no extra network request — cache always holds ['recommendations'] from initial fetch).
 * Shows top 3 cross-market picks with the selected viewMode card type.
 */
function CrossMarketSuggestions({ viewMode }: { viewMode: string }) {
  const queryClient = useQueryClient();
  const allRecs = queryClient.getQueryData<Recommendation[]>(['recommendations']) ?? [];
  const topRecs = allRecs.slice(0, 3);

  if (topRecs.length === 0) return <EmptyRecommendations />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {topRecs.map((rec: Recommendation) =>
        viewMode === 'analyst' ? (
          <RecommendationAnalystCard key={rec.id} recommendation={rec} />
        ) : (
          <RecommendationCard key={rec.id} recommendation={rec} />
        ),
      )}
    </div>
  );
}

/**
 * Executive Overview — primary landing page of the Incremental IQ dashboard.
 *
 * Layout (top to bottom, per design spec "clean analytical at top, denser toward bottom"):
 *   1. Upcoming seasonal alerts (proactive, per user decision)
 *   2. KPI grid — 4 draggable cards (KPIs first per loading priority)
 *   3. Hero chart — incremental revenue over time
 *   4. Supporting charts — platform comparison
 *   5. Recommendations — ranked by expected impact, filtered by selected market
 *
 * Progressive loading: each section has independent skeleton placeholders.
 * Mobile-responsive: all grids use sm:/lg: breakpoints, charts scale to full width.
 *
 * NOTE: Zustand rehydration is handled in the dashboard layout (layout.tsx).
 * tenantId comes from session cookie automatically — no PLACEHOLDER_TENANT_ID.
 */
export default function ExecutiveOverviewPage() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  const comparisonRange = useDashboardStore((s) => s.comparisonRange);
  const comparisonEnabled = useDashboardStore((s) => s.comparisonEnabled);
  const viewMode = useDashboardStore((s) => s.viewMode);
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);
  const markets = useDashboardStore((s) => s.markets);
  const setSelectedMarket = useDashboardStore((s) => s.setSelectedMarket);

  // Derive selected market display info
  const selectedMarketInfo = markets.find((m) => m.id === selectedMarket);

  // Fetch KPIs — tenantId from session cookie, not passed as param
  const { data: kpisData, isLoading: kpisLoading } = useKpis(
    dateRange,
    comparisonEnabled ? comparisonRange : undefined,
    selectedMarket,
  );

  // Fetch recommendations — tenantId from session cookie; client-side filtered by selectedMarket via select
  const { data: recommendations, isLoading: recsLoading } = useRecommendations();

  // Fetch campaigns for charts — tenantId from session cookie
  const { data: campaignRows, isLoading: campaignsLoading } = useCampaigns(dateRange, undefined, undefined, selectedMarket);

  // Derive time series from KPI data and campaign data
  const timeSeriesData: TimeSeriesDataPoint[] = React.useMemo(() => {
    if (!kpisData) return [];
    return buildTimeSeriesFromTotal(kpisData.period.incrementalRevenue, dateRange);
  }, [kpisData, dateRange]);

  // Derive platform comparison data
  const platformData: PlatformDataPoint[] = React.useMemo(() => {
    if (!campaignRows) return [];
    return buildPlatformData(campaignRows);
  }, [campaignRows]);

  // Split recommendations into seasonal alerts and campaign recommendations
  const seasonalAlerts = React.useMemo(
    () =>
      (recommendations ?? [])
        .filter((r: Recommendation) => r.seasonalAlert != null)
        .map((r: Recommendation) => r.seasonalAlert!),
    [recommendations],
  );

  // Provide export data to AppHeader via context
  const { setExportData } = useExportContext();
  React.useEffect(() => {
    if (campaignRows && campaignRows.length > 0) {
      setExportData(
        campaignRows as unknown as Record<string, unknown>[],
        `executive-overview-${format(dateRange.from, 'yyyy-MM-dd')}`,
      );
    }
  }, [campaignRows, dateRange.from, setExportData]);

  // Stale market fallback — if persisted selectedMarket no longer exists in markets list
  React.useEffect(() => {
    if (selectedMarket && markets.length > 0) {
      const exists = markets.some((m) => m.id === selectedMarket);
      if (!exists) {
        setSelectedMarket(null);
        toast('Selected market no longer exists — showing all markets.');
      }
    }
  }, [markets, selectedMarket, setSelectedMarket]);

  const campaignRecs = recommendations ?? [];
  const lowConfidenceRecs = campaignRecs.filter(
    (r: Recommendation) => r.confidenceLevel === 'low' || r.confidenceLevel === 'insufficient',
  );
  const actionableRecs = campaignRecs.filter(
    (r: Recommendation) => r.confidenceLevel !== 'low' && r.confidenceLevel !== 'insufficient',
  );

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Section 1 — Upcoming seasonal alerts */}
      {(seasonalAlerts.length > 0 || !recsLoading) && (
        <section aria-label="Upcoming seasonal events">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upcoming Events
          </h2>
          {recsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16 hidden sm:block" />
            </div>
          ) : seasonalAlerts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {seasonalAlerts.map((alert, i) => (
                <SeasonalAlertCard key={`${alert.eventName}-${i}`} alert={alert} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No seasonal events in the next 8 weeks.
            </p>
          )}
        </section>
      )}

      {/* Section 2 — KPI grid (KPIs first per progressive loading spec) */}
      <section aria-label="Key performance indicators">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Key Metrics
        </h2>
        <KpiGrid kpisData={kpisData} isLoading={kpisLoading} />
      </section>

      {/* Section 3 — Hero incremental revenue chart */}
      <section aria-label="Incremental revenue over time">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Incremental Revenue
        </h2>
        {kpisLoading ? (
          <ChartSkeleton height={280} />
        ) : (
          <div className="rounded-lg border bg-card p-4">
            <IncrementalRevenueChart
              data={timeSeriesData}
              comparisonEnabled={comparisonEnabled}
              isLoading={kpisLoading}
              height={280}
            />
          </div>
        )}
      </section>

      {/* Section 4 — Supporting charts */}
      <section aria-label="Platform comparison">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform Breakdown
        </h2>
        {campaignsLoading ? (
          <ChartSkeleton height={240} />
        ) : (
          <div className="rounded-lg border bg-card p-4">
            <PlatformComparisonChart
              data={platformData}
              isLoading={campaignsLoading}
              height={240}
            />
          </div>
        )}
      </section>

      {/* Section 5 — Recommendations */}
      <section aria-label="Campaign recommendations">
        {/* Market filter label */}
        {selectedMarket && selectedMarketInfo && (
          <p className="mb-2 text-xs text-muted-foreground">
            Filtered: {selectedMarketInfo.displayName} ({campaignRecs.length} campaign{campaignRecs.length !== 1 ? 's' : ''})
          </p>
        )}

        {/* Low-data warning for markets with fewer than 5 campaigns */}
        {selectedMarket && selectedMarketInfo && selectedMarketInfo.campaignCount < 5 && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            Limited data — recommendations may improve as more campaigns are added to this market
          </p>
        )}

        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recommendations
        </h2>

        {recsLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : campaignRecs.length === 0 ? (
          selectedMarket ? (
            <div className="space-y-4">
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <p className="font-medium">No recommendations for this market</p>
                <p className="mt-1">Here are top picks from other markets:</p>
              </div>
              <CrossMarketSuggestions viewMode={viewMode} />
            </div>
          ) : (
            <EmptyRecommendations />
          )
        ) : (
          <div className="space-y-6">
            {/* Actionable recommendations */}
            {actionableRecs.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {actionableRecs.map((rec: Recommendation) =>
                  viewMode === 'analyst' ? (
                    <RecommendationAnalystCard key={rec.id} recommendation={rec} />
                  ) : (
                    <RecommendationCard key={rec.id} recommendation={rec} />
                  ),
                )}
              </div>
            )}

            {/* Low-confidence / waiting recommendations */}
            {lowConfidenceRecs.length > 0 && (
              <div>
                <h3 className="mb-3 text-xs font-medium text-muted-foreground">
                  Awaiting Sufficient Data
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {lowConfidenceRecs.map((rec: Recommendation) => (
                    <LowConfidenceCard key={rec.id} recommendation={rec} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
