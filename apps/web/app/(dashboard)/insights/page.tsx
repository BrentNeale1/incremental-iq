'use client';

import * as React from 'react';
import { useDashboardStore } from '@/lib/store/dashboard';
import { useIncrementality } from '@/lib/hooks/useIncrementality';
import { useSaturation } from '@/lib/hooks/useSaturation';
import { ModelHealthOverview } from '@/components/insights/ModelHealthOverview';
import { ConfidenceIntervalChart } from '@/components/insights/ConfidenceIntervalChart';
import { ForecastActualChart, type ForecastActualPoint } from '@/components/insights/ForecastActualChart';
import { ProgressionView } from '@/components/insights/ProgressionView';
import { MethodologySidebar } from '@/components/insights/MethodologySidebar';
import { DrillDownTable, type DrillDownRow } from '@/components/insights/DrillDownTable';
import {
  Collapsible,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExportContext } from '@/lib/export/context';
import { useTenantId } from '@/lib/auth/tenant-context';

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
 */
export default function StatisticalInsightsPage() {
  const tenantId = useTenantId();
  const dateRange = useDashboardStore((s) => s.dateRange);

  const { setExportData } = useExportContext();

  // Incrementality scores for all campaigns
  const { data: scores, isLoading: scoresLoading } = useIncrementality(
    tenantId,
    undefined,
    'adjusted',
  );

  // Saturation for selected campaign
  React.useEffect(() => {
    if (scores && scores.length > 0) {
      setExportData(scores as unknown as Record<string, unknown>[], 'statistical-insights');
    }
  }, [scores, setExportData]);

  const [selectedRow, setSelectedRow] = React.useState<DrillDownRow | null>(null);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const { data: saturationData } = useSaturation(
    tenantId,
    selectedRow?.id,
  );

  const selectedScore = React.useMemo(() => {
    if (!scores || !selectedRow) return null;
    return scores.find((s) => s.campaignId === selectedRow.id && s.scoreType === 'adjusted') ?? null;
  }, [scores, selectedRow]);

  const selectedSaturation = React.useMemo(() => {
    if (!saturationData || !selectedRow) return null;
    return saturationData.find((s) => s.campaignId === selectedRow.id) ?? null;
  }, [saturationData, selectedRow]);

  // Forecast vs actual — derived from incrementality scores as a scaffold
  // (Phase 5 will wire in actual Prophet forecast output)
  const forecastData = React.useMemo<ForecastActualPoint[]>(() => {
    if (!scores || scores.length === 0) return [];
    // Use liftMean as "actual" and liftUpper-biased as "forecast" as a visual scaffold
    return scores
      .filter((s) => s.scoreType === 'adjusted')
      .sort((a, b) => a.scoredAt.localeCompare(b.scoredAt))
      .slice(0, 30)
      .map((s) => ({
        date: s.scoredAt,
        forecast: s.liftMean * (1 + 0.08), // Prophet baseline slightly above observed
        actual: s.liftMean,
        divergence: Math.abs(s.liftMean * 0.08) / Math.max(s.liftMean, 0.001),
      }));
  }, [scores]);

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
                  <ForecastActualChart data={forecastData} isLoading={scoresLoading} height={240} />
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
                tenantId={tenantId}
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
