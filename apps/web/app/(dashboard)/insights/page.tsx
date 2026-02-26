'use client';

import * as React from 'react';
import { useDashboardStore } from '@/lib/store/dashboard';
import { useIncrementality } from '@/lib/hooks/useIncrementality';
import { useSaturation } from '@/lib/hooks/useSaturation';
import { useForecast } from '@/lib/hooks/useForecast';
import { ModelHealthOverview } from '@/components/insights/ModelHealthOverview';
import { ConfidenceIntervalChart } from '@/components/insights/ConfidenceIntervalChart';
import { ForecastActualChart, type ForecastActualPoint } from '@/components/insights/ForecastActualChart';
import { ProgressionView } from '@/components/insights/ProgressionView';
import { MethodologySidebar } from '@/components/insights/MethodologySidebar';
import { DrillDownTable, type DrillDownRow } from '@/components/insights/DrillDownTable';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExportContext } from '@/lib/export/context';

/**
 * Statistical Insights page — analyst-focused deep-dive into model outputs.
 *
 * Layout (with MethodologySidebar collapsible on the right):
 *   Section 1 — ModelHealthOverview (4 summary cards)
 *   Section 2 — ConfidenceIntervalChart + ForecastActualChart (side by side)
 *   Section 3 — ProgressionView (12-month timeline)
 *   Section 4 — DrillDownTable (campaign -> cluster -> channel -> overall)
 *
 * Each section is wrapped in a shadcn Collapsible per design spec.
 * Progressive loading with per-section skeleton placeholders.
 * MethodologySidebar shows full model details for the selected campaign row.
 *
 * RPRT-03: Drill-down hierarchy; RPRT-07: Analyst model transparency.
 * tenantId comes from session cookie automatically — no PLACEHOLDER_TENANT_ID.
 */
export default function StatisticalInsightsPage() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);
  const markets = useDashboardStore((s) => s.markets);

  const { setExportData } = useExportContext();

  // Incrementality scores for all campaigns — tenantId from session cookie
  // Pass selectedMarket so API filters scores to the chosen market (MRKT-04)
  const { data: scores, isLoading: scoresLoading } = useIncrementality(
    undefined,
    'adjusted',
    selectedMarket ?? undefined,
  );

  // Saturation for selected campaign — tenantId from session cookie
  React.useEffect(() => {
    if (scores && scores.length > 0) {
      setExportData(scores as unknown as Record<string, unknown>[], 'statistical-insights');
    }
  }, [scores, setExportData]);

  const [selectedRow, setSelectedRow] = React.useState<DrillDownRow | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const { data: saturationData } = useSaturation(selectedRow?.id);

  // Prophet forecast for selected campaign — real data from Python FastAPI service
  const { data: forecastApiData, isLoading: forecastLoading } = useForecast(selectedRow?.id);

  const selectedScore = React.useMemo(() => {
    if (!scores || !selectedRow) return null;
    return scores.find((s) => s.campaignId === selectedRow.id && s.scoreType === 'adjusted') ?? null;
  }, [scores, selectedRow]);

  const selectedSaturation = React.useMemo(() => {
    if (!saturationData || !selectedRow) return null;
    // Defense-in-depth: guard against unexpected non-array response shapes
    if (!Array.isArray(saturationData)) return null;
    return saturationData.find((s) => s.campaignId === selectedRow.id) ?? null;
  }, [saturationData, selectedRow]);

  // Merge Prophet forecast data into chart-ready format
  // Combines historical fitted values + actual observed values + future predictions
  const forecastChartData = React.useMemo<ForecastActualPoint[]>(() => {
    if (!forecastApiData) return [];

    const { historical, future, actuals } = forecastApiData;

    // Build actuals map for fast lookup by date
    const actualsMap = new Map<string, number>();
    for (const a of actuals) {
      actualsMap.set(a.date, a.value);
    }

    // Historical points: actual observed value + Prophet fitted yhat + CI band
    const historicalPoints: ForecastActualPoint[] = historical.map((p) => ({
      date: p.date,
      actual: actualsMap.get(p.date),
      forecast: p.yhat,
      forecastLower: p.yhat_lower,
      forecastUpper: p.yhat_upper,
      ciBase: p.yhat_lower,
      ciWidth: Math.max(0, p.yhat_upper - p.yhat_lower),
    }));

    // Future points: Prophet predicted yhat + CI band only (no actual value)
    const futurePoints: ForecastActualPoint[] = future.map((p) => ({
      date: p.date,
      actual: undefined,
      forecast: p.yhat,
      forecastLower: p.yhat_lower,
      forecastUpper: p.yhat_upper,
      ciBase: p.yhat_lower,
      ciWidth: Math.max(0, p.yhat_upper - p.yhat_lower),
    }));

    return [...historicalPoints, ...futurePoints].sort((a, b) => a.date.localeCompare(b.date));
  }, [forecastApiData]);

  // Collapsible section state
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    new Set(['model-health', 'charts', 'progression', 'drill-down']),
  );

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function SectionHeader({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
    const isOpen = openSections.has(id);
    return (
      <button
        className="flex w-full items-center justify-between"
        onClick={() => toggleSection(id)}
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground/70">{subtitle}</p>}
        </div>
        <ChevronDownIcon
          className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-6">
      {/* Main content */}
      <div className="min-w-0 flex-1 space-y-8">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Statistical Insights</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Model transparency and campaign-level statistical deep-dive for analysts.
            </p>
          </div>
          {/* Methodology sidebar toggle button (panel renders in aside column) */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted"
            aria-expanded={sidebarOpen}
          >
            <span>{sidebarOpen ? 'Hide Methodology' : 'Show Methodology'}</span>
            <ChevronDownIcon
              className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', sidebarOpen && 'rotate-180')}
            />
          </button>
        </div>

        {/* Empty market state — show when a market is selected but no data exists for it */}
        {selectedMarket && !scoresLoading && (!scores || scores.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No incrementality data for{' '}
              <span className="font-medium">
                {markets.find((m) => m.id === selectedMarket)?.displayName ?? 'this market'}
              </span>{' '}
              yet.
            </p>
          </div>
        )}

        {/* Section 1 — Model Health Overview */}
        <Collapsible open={openSections.has('model-health')}>
          <section aria-label="Model health overview">
            <div className="mb-3">
              <SectionHeader
                id="model-health"
                title="Model Health"
                subtitle="Aggregate model accuracy and confidence metrics"
              />
            </div>
            <CollapsibleContent>
              <ModelHealthOverview scores={scores} isLoading={scoresLoading} />
            </CollapsibleContent>
          </section>
        </Collapsible>

        {/* Section 2 — Confidence Interval + Forecast vs Actual */}
        <Collapsible open={openSections.has('charts')}>
          <section aria-label="Confidence interval and forecast charts">
            <div className="mb-3">
              <SectionHeader
                id="charts"
                title="Lift Analysis"
                subtitle="Confidence intervals and forecast vs actual overlay"
              />
            </div>
            <CollapsibleContent>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">Confidence Interval Trend</h3>
                  <ConfidenceIntervalChart scores={scores} isLoading={scoresLoading} height={240} />
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="mb-3 text-sm font-medium">Forecast vs Actual</h3>
                  {forecastLoading ? (
                    <Skeleton className="w-full rounded-md" style={{ height: 240 }} />
                  ) : (
                    <ForecastActualChart
                      data={forecastChartData}
                      isLoading={false}
                      height={240}
                      emptyMessage={
                        !selectedRow
                          ? 'Select a campaign in the table below to view its forecast'
                          : 'Forecast data not available for this campaign'
                      }
                    />
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>

        {/* Section 3 — 12-Month Progression */}
        <Collapsible open={openSections.has('progression')}>
          <section aria-label="12-month model progression">
            <div className="mb-3">
              <SectionHeader
                id="progression"
                title="Model Progression"
                subtitle="Last 12 months of confidence and accuracy improvement"
              />
            </div>
            <CollapsibleContent>
              <div className="rounded-lg border bg-card p-4">
                <ProgressionView scores={scores} isLoading={scoresLoading} />
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>

        {/* Section 4 — Drill-Down Table */}
        <Collapsible open={openSections.has('drill-down')}>
          <section aria-label="Campaign drill-down table">
            <div className="mb-3">
              <SectionHeader
                id="drill-down"
                title="Campaign Drill-Down"
                subtitle="Expandable table with preset and custom filters — campaign, cluster, channel, or overall"
              />
            </div>
            <CollapsibleContent>
              <DrillDownTable
                dateRange={dateRange}
                onSelectRow={(row) => {
                  setSelectedRow(row);
                  setSidebarOpen(true);
                }}
              />
            </CollapsibleContent>
          </section>
        </Collapsible>
      </div>

      {/* Methodology sidebar (desktop — sticky right column, lg+) */}
      {sidebarOpen && (
        <aside className="hidden lg:block lg:w-80 lg:shrink-0">
          <div className="sticky top-4">
            <MethodologySidebar
              selectedScore={selectedScore}
              saturationCurve={selectedSaturation}
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen(false)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
