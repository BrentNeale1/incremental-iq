'use client';

import { useQuery } from '@tanstack/react-query';
import type { IntegrationFreshnessItem, GlobalFreshnessStatus } from '@/lib/hooks/useFreshness';

export interface SyncRun {
  id: string;
  integrationId: string;
  platform: string;
  runType: 'incremental' | 'backfill' | 'manual';
  status: 'running' | 'success' | 'partial' | 'failed';
  startedAt: string;
  completedAt: string | null;
  recordsIngested: number | null;
  errorMessage: string | null;
}

export interface IntegrationSyncHistory {
  integration: IntegrationFreshnessItem;
  recentRuns: SyncRun[];
  isStale: boolean;
  staleSinceHours: number | null;
}

export interface SyncHistoryData {
  globalStatus: GlobalFreshnessStatus['globalStatus'];
  integrations: IntegrationSyncHistory[];
  warnings: string[];
}

/**
 * useSyncHistory — fetches integration status + sync run history.
 *
 * Uses /api/integrations/status (Phase 2 endpoint) for overall freshness
 * and integration-level status. Sync run details are derived from the
 * freshness response until a dedicated history endpoint is added.
 *
 * staleTime: 2 minutes — health data should be relatively fresh.
 */
export function useSyncHistory(tenantId?: string) {
  return useQuery<SyncHistoryData>({
    queryKey: ['syncHistory', tenantId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (tenantId) {
        headers['X-Tenant-Id'] = tenantId;
      }

      const res = await fetch('/api/integrations/status', { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch sync history: ${res.status}`);
      }

      const freshness = await res.json() as GlobalFreshnessStatus;

      // Derive per-integration sync history from freshness data
      const now = Date.now();
      const integrations: IntegrationSyncHistory[] = freshness.integrations.map((integration) => {
        // Determine staleness — "Stale" status means >24h since last sync
        const isStale = integration.status === 'expired' || integration.freshness.includes('day');
        const staleSinceHours = isStale
          ? (() => {
              const match = integration.freshness.match(/(\d+)\s*day/);
              if (match) return parseInt(match[1], 10) * 24;
              const hourMatch = integration.freshness.match(/(\d+)\s*hour/);
              if (hourMatch) return parseInt(hourMatch[1], 10);
              return null;
            })()
          : null;

        // Synthetic recent runs from lastSyncStatus (history endpoint deferred to Phase 5)
        const syntheticRun: SyncRun | null = integration.lastSyncStatus
          ? {
              id: `${integration.id}-last`,
              integrationId: integration.id,
              platform: integration.platform,
              runType: 'incremental',
              status: integration.lastSyncStatus === 'success' ? 'success' : integration.lastSyncStatus === 'partial' ? 'partial' : 'failed',
              startedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
              completedAt: new Date(now - 2 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
              recordsIngested: null,
              errorMessage: null,
            }
          : null;

        return {
          integration,
          recentRuns: syntheticRun ? [syntheticRun] : [],
          isStale,
          staleSinceHours,
        };
      });

      return {
        globalStatus: freshness.globalStatus,
        integrations,
        warnings: freshness.warnings,
      };
    },
    enabled: !!tenantId,
    staleTime: 2 * 60 * 1000,
  });
}
