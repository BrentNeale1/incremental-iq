'use client';

import * as React from 'react';
import { useSyncHistory } from '@/lib/hooks/useSyncHistory';
import { SyncStatusList } from '@/components/health/SyncStatusList';
import { DataGapsTimeline } from '@/components/health/DataGapsTimeline';
import { IntegrationSettings } from '@/components/health/IntegrationSettings';
import { EmptyHealth } from '@/components/dashboard/EmptyStates';
import { Skeleton } from '@/components/ui/skeleton';
import { useExportContext } from '@/lib/export/context';

/**
 * Data Health page — integration sync status, missing data gaps, and integration management.
 *
 * Layout (per design spec):
 *   Section 1 — SyncStatusList: per-integration sync status with freshness badges (RPRT-04)
 *   Section 2 — DataGapsTimeline: visual 90-day data coverage per integration
 *   Section 3 — IntegrationSettings: reconnect, sync now, advanced options
 *
 * Progressive loading with skeleton placeholders.
 * Empty state: EmptyHealth with OAuth setup links.
 * Mobile-responsive: full-width sections, flex-wrap for action rows.
 *
 * Stale data always shows warning banners but never hides the dashboard.
 * tenantId comes from session cookie automatically — no PLACEHOLDER_TENANT_ID.
 */
export default function DataHealthPage() {
  const { data: syncHistory, isLoading, isError, refetch } = useSyncHistory();
  const { setExportData } = useExportContext();
  React.useEffect(() => {
    if (syncHistory?.integrations && syncHistory.integrations.length > 0) {
      const flatRows = syncHistory.integrations.map((item) => ({
        platform: item.integration.platform,
        status: item.integration.status,
        freshness: item.integration.freshness,
        last_sync_status: item.integration.lastSyncStatus ?? '\u2014',
        is_stale: item.isStale ? 'Yes' : 'No',
        stale_since_hours: item.staleSinceHours != null ? item.staleSinceHours : '\u2014',
        last_run_type: item.recentRuns[0]?.runType ?? '\u2014',
        last_run_status: item.recentRuns[0]?.status ?? '\u2014',
        records_ingested: item.recentRuns[0]?.recordsIngested != null ? item.recentRuns[0].recordsIngested : '\u2014',
      }));
      setExportData(flatRows as unknown as Record<string, unknown>[], 'data-health');
    }
  }, [syncHistory, setExportData]);

  async function handleManualSync(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations/${integrationId}/sync`, {
        method: 'POST',
      });
      if (!res.ok) {
        console.error('Manual sync failed:', res.status);
      }
      // Refetch status after trigger
      await refetch();
    } catch (err) {
      console.error('Manual sync error:', err);
    }
  }

  const integrations = syncHistory?.integrations ?? [];
  const hasIntegrations = !isLoading && integrations.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Data Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Integration sync status, data coverage, and connection management.
        </p>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Unable to load integration status. Check that the API is reachable and retry.
        </div>
      )}

      {/* Empty state — no integrations */}
      {!isLoading && !isError && integrations.length === 0 && (
        <div className="space-y-6">
          <EmptyHealth />

          {/* OAuth connection links */}
          <div className="rounded-lg border bg-card p-6 text-center">
            <h2 className="mb-4 text-sm font-medium">Connect your first platform</h2>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="/api/oauth/meta"
                className="rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px] flex items-center"
              >
                Connect Meta Ads
              </a>
              <a
                href="/api/oauth/google"
                className="rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px] flex items-center"
              >
                Connect Google Ads
              </a>
              <a
                href="/api/oauth/shopify"
                className="rounded-md border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors min-h-[44px] flex items-center"
              >
                Connect Shopify
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Section 1 — Sync Status */}
      {(isLoading || hasIntegrations) && (
        <section aria-label="Integration sync status">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sync Status
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : (
            <SyncStatusList
              integrations={integrations}
              isLoading={false}
              onManualSync={handleManualSync}
            />
          )}
        </section>
      )}

      {/* Section 2 — Data Gaps Timeline */}
      {(isLoading || hasIntegrations) && (
        <section aria-label="Data coverage timeline">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data Coverage — Last 90 Days
          </h2>
          <DataGapsTimeline integrations={integrations} isLoading={isLoading} />
        </section>
      )}

      {/* Section 3 — Integration Settings */}
      {(isLoading || hasIntegrations) && (
        <section aria-label="Integration settings">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Integration Settings
          </h2>
          <IntegrationSettings
            integrations={integrations}
            isLoading={isLoading}
            onManualSync={handleManualSync}
          />
        </section>
      )}
    </div>
  );
}
