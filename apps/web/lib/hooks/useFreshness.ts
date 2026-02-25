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
 * useFreshness — fetches integration freshness status from /api/integrations/status.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Used by SidebarNav to show per-integration health dots:
 *   green dot  — fresh (synced within 24h, no errors)
 *   yellow dot — stale (>24h but not erroring)
 *   red dot    — error or expired token
 *
 * staleTime: 5 minutes — freshness indicators don't need real-time updates.
 */
export function useFreshness() {
  return useQuery<GlobalFreshnessStatus>({
    queryKey: ['freshness'],
    queryFn: async () => {
      const res = await fetch('/api/integrations/status');
      if (!res.ok) {
        throw new Error(`Failed to fetch freshness: ${res.status}`);
      }
      return res.json() as Promise<GlobalFreshnessStatus>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
