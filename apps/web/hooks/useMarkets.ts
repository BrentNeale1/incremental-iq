'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDashboardStore } from '@/lib/store/dashboard';
import type { MarketInfo } from '@/lib/store/dashboard';

/**
 * TanStack Query hook wrapping GET /api/markets.
 *
 * On success, syncs the markets array into the Zustand dashboard store
 * so components like MarketSelector can read from a single source.
 *
 * @param tenantId - Tenant UUID (undefined disables the query).
 */
export function useMarkets(tenantId: string | undefined) {
  const setMarkets = useDashboardStore((s) => s.setMarkets);

  const query = useQuery<MarketInfo[]>({
    queryKey: ['markets', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/markets?tenantId=${tenantId}`);
      if (!res.ok) throw new Error('Failed to fetch markets');
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Sync to Zustand store when data arrives (replaces TQ v5-removed onSuccess)
  useEffect(() => {
    if (query.data) {
      setMarkets(query.data);
    }
  }, [query.data, setMarkets]);

  return query;
}
