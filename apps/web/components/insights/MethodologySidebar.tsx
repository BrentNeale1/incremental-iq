'use client';

import * as React from 'react';
import { format, parseISO } from 'date-fns';
import { InfoIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { IncrementalityScore } from '@/lib/hooks/useIncrementality';
import type { SaturationCurve } from '@/lib/hooks/useSaturation';

interface MethodologySidebarProps {
  selectedScore: IncrementalityScore | null;
  saturationCurve: SaturationCurve | null;
  isOpen: boolean;
  onToggle: () => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * MethodologySidebar — collapsible panel showing full model details for the selected campaign.
 *
 * Displays:
 *   - ITS model type: "CausalPy Bayesian Interrupted Time Series"
 *   - Treatment window (analysis date range)
 *   - Prophet baseline params (seasonality mode, holidays, changepoint prior)
 *   - Hill saturation curve (alpha, mu, gamma, current saturation %)
 *   - Scoring metadata (scored_at, dataPoints, status)
 *
 * Toggleable via "Show Methodology" / "Hide Methodology" button in the page header.
 * Per design spec: "Methodology sidebar — persistent collapsible panel showing full model details."
 */
export function MethodologySidebar({
  selectedScore,
  saturationCurve,
  isOpen,
  onToggle,
}: MethodologySidebarProps) {
  // Sidebar trigger button (always visible)
  const triggerButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className="flex items-center gap-1.5"
      aria-expanded={isOpen}
      aria-controls="methodology-sidebar"
    >
      <InfoIcon className="h-3.5 w-3.5" />
      {isOpen ? 'Hide Methodology' : 'Show Methodology'}
      <ChevronRightIcon
        className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
      />
    </Button>
  );

  if (!isOpen) {
    return <div>{triggerButton}</div>;
  }

  return (
    <div className="flex flex-col">
      {triggerButton}

      {/* Sidebar panel */}
      <aside
        id="methodology-sidebar"
        className="mt-4 w-full rounded-lg border bg-card lg:sticky lg:top-4 lg:w-80"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Model Methodology</h3>
          <button
            onClick={onToggle}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close methodology sidebar"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="h-[calc(100vh-14rem)] max-h-[600px]">
          <div className="space-y-6 p-4">
            {/* ITS Model */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Statistical Model
              </h4>
              <div className="divide-y">
                <DetailRow label="Method" value="CausalPy Bayesian ITS" />
                <DetailRow label="Type" value="Interrupted Time Series" />
                <DetailRow
                  label="Backend"
                  value={
                    <Badge variant="outline" className="text-xs">
                      PyMC / NUTS
                    </Badge>
                  }
                />
              </div>
            </section>

            <Separator />

            {/* Prophet Baseline */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Prophet Baseline
              </h4>
              <div className="divide-y">
                <DetailRow label="Seasonality" value="Multiplicative" />
                <DetailRow label="Holidays" value="Retail calendar injected" />
                <DetailRow label="Changepoint prior" value="0.05 (default)" />
                <DetailRow label="Weekly seasonality" value="Enabled (7-day cycle)" />
                <DetailRow label="Zero-spend threshold" value="20% of data points" />
              </div>
            </section>

            <Separator />

            {/* Hierarchical Pooling */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hierarchical Pooling
              </h4>
              <div className="divide-y">
                <DetailRow label="Method" value="Partial pooling across campaigns" />
                <DetailRow label="Data-rich campaigns" value="Observed (direct lift)" />
                <DetailRow label="Sparse campaigns" value="Latent (cluster shrinkage)" />
                <DetailRow label="Uncertainty boost" value="2x sigma for sparse" />
              </div>
            </section>

            <Separator />

            {/* Selected Campaign Details */}
            {selectedScore ? (
              <>
                <section>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Selected Campaign
                  </h4>
                  <p className="mb-2 text-sm font-medium">{selectedScore.campaignName}</p>
                  <div className="divide-y">
                    <DetailRow
                      label="Platform"
                      value={
                        <Badge variant="outline" className="text-xs capitalize">
                          {selectedScore.platform}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label="Lift Mean"
                      value={
                        <span
                          className={
                            selectedScore.liftMean > 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {(selectedScore.liftMean * 100).toFixed(2)}pp
                        </span>
                      }
                    />
                    <DetailRow
                      label="CI Lower"
                      value={`${(selectedScore.liftLower * 100).toFixed(2)}pp`}
                    />
                    <DetailRow
                      label="CI Upper"
                      value={`${(selectedScore.liftUpper * 100).toFixed(2)}pp`}
                    />
                    <DetailRow
                      label="Confidence"
                      value={
                        <span
                          className={
                            selectedScore.confidence >= 0.8
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : selectedScore.confidence >= 0.5
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {(selectedScore.confidence * 100).toFixed(1)}%
                        </span>
                      }
                    />
                    <DetailRow label="Data Points" value={String(selectedScore.dataPoints)} />
                    <DetailRow
                      label="Status"
                      value={
                        <Badge variant="outline" className="text-xs capitalize">
                          {selectedScore.status.replace(/_/g, ' ')}
                        </Badge>
                      }
                    />
                    <DetailRow
                      label="Scored At"
                      value={format(parseISO(selectedScore.scoredAt), 'MMM d, yyyy')}
                    />
                  </div>
                </section>

                <Separator />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a row in the drill-down table to see campaign-specific model details.
              </p>
            )}

            {/* Hill Saturation */}
            {saturationCurve && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Hill Saturation Curve
                </h4>
                <div className="divide-y">
                  <DetailRow
                    label="Alpha (shape)"
                    value={saturationCurve.alpha != null ? saturationCurve.alpha.toFixed(4) : '—'}
                  />
                  <DetailRow
                    label="Mu (midpoint)"
                    value={saturationCurve.mu != null ? `$${saturationCurve.mu.toFixed(0)}` : '—'}
                  />
                  <DetailRow
                    label="Gamma (scale)"
                    value={saturationCurve.gamma != null ? saturationCurve.gamma.toFixed(4) : '—'}
                  />
                  <DetailRow
                    label="Saturation %"
                    value={
                      saturationCurve.saturationPercent != null ? (
                        <span
                          className={
                            saturationCurve.saturationPercent >= 80
                              ? 'text-red-600 dark:text-red-400'
                              : saturationCurve.saturationPercent >= 60
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {saturationCurve.saturationPercent.toFixed(1)}%
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <DetailRow
                    label="Curve status"
                    value={
                      <Badge variant="outline" className="text-xs capitalize">
                        {saturationCurve.status.replace(/_/g, ' ')}
                      </Badge>
                    }
                  />
                </div>
              </section>
            )}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}
