'use client';

import { useQuery } from '@tanstack/react-query';

export interface IntegrationFreshnessItem {
  id: string;
  platform: string;
  status: 'active' | 'expired' | 'error' | 'disconnected';
  accountName: string | null;
  freshness: string;
  lastSyncStatus: string | null;
  syncInProgress: boolean;
}

export interface GlobalFreshnessStatus {
  globalStatus: 'healthy' | 'warning' | 'error';
  integrations: IntegrationFreshnessItem[];
  warnings: string[];
}

/**
 * Fetches integration freshness status from /api/integrations/status.
 *
 * Used by SidebarNav to show per-integration health dots:
 *   green dot  — fresh (synced within 24h, no errors)
 *   yellow dot — stale (>24h but not erroring)
 *   red dot    — error or expired token
 *
 * staleTime: 5 minutes — freshness indicators don't need real-time updates.
 *
 * NOTE: Phase 2 uses X-Tenant-Id header for tenant identification.
 * tenantId defaults to a placeholder until auth (Phase 6) is wired in.
 */
export function useFreshness(tenantId?: string) {
  return useQuery<GlobalFreshnessStatus>({
    queryKey: ['freshness', tenantId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (tenantId) {
        headers['X-Tenant-Id'] = tenantId;
      }

      const res = await fetch('/api/integrations/status', { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch freshness: ${res.status}`);
      }
      return res.json() as Promise<GlobalFreshnessStatus>;
    },
    // Only fetch if we have a tenantId
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
