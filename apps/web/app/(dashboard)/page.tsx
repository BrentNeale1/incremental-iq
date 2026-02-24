'use client';

import * as React from 'react';
import { format, eachDayOfInterval } from 'date-fns';
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
import type { Recommendation } from '@/lib/recommendations/types';

/**
 * PLACEHOLDER tenant ID — Phase 6 (auth) will supply real tenant from session.
 * Until then, API calls with this placeholder will return empty data (no matching tenant).
 */
const PLACEHOLDER_TENANT_ID = undefined;

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
  directRevenue: number;
  incrementalRevenue: number;
}[]): PlatformDataPoint[] {
  const byPlatform = new Map<string, PlatformDataPoint>();

  for (const row of campaigns) {
    const key = row.platform.charAt(0).toUpperCase() + row.platform.slice(1);
    const existing = byPlatform.get(key) ?? {
      platform: key,
      spend: 0,
      revenue: 0,
      incrementalRevenue: 0,
    };
    byPlatform.set(key, {
      platform: key,
      spend: existing.spend + row.spend,
      revenue: existing.revenue + row.directRevenue,
      incrementalRevenue: existing.incrementalRevenue + row.incrementalRevenue,
    });
  }

  return Array.from(byPlatform.values());
}

/**
 * Executive Overview — primary landing page of the Incremental IQ dashboard.
 *
 * Layout (top to bottom, per design spec "clean analytical at top, denser toward bottom"):
 *   1. Upcoming seasonal alerts (proactive, per user decision)
 *   2. KPI grid — 4 draggable cards (KPIs first per loading priority)
 *   3. Hero chart — incremental revenue over time
 *   4. Supporting charts — platform comparison
 *   5. Recommendations — ranked by expected impact
 *
 * Progressive loading: each section has independent skeleton placeholders.
 * Mobile-responsive: all grids use sm:/lg: breakpoints, charts scale to full width.
 *
 * NOTE: Zustand rehydration is handled in the dashboard layout (layout.tsx).
 */
export default function ExecutiveOverviewPage() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  const comparisonRange = useDashboardStore((s) => s.comparisonRange);
  const comparisonEnabled = useDashboardStore((s) => s.comparisonEnabled);
  const viewMode = useDashboardStore((s) => s.viewMode);

  // Fetch KPIs
  const { data: kpisData, isLoading: kpisLoading } = useKpis(
    PLACEHOLDER_TENANT_ID,
    dateRange,
    comparisonEnabled ? comparisonRange : undefined,
  );

  // Fetch recommendations
  const { data: recommendations, isLoading: recsLoading } = useRecommendations(
    PLACEHOLDER_TENANT_ID,
  );

  // Fetch campaigns for charts
  const { data: campaignRows, isLoading: campaignsLoading } = useCampaigns(
    PLACEHOLDER_TENANT_ID,
    dateRange,
  );

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
          <EmptyRecommendations />
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
