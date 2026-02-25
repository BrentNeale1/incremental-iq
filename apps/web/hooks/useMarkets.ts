'use client';

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

  return useQuery<MarketInfo[]>({
    queryKey: ['markets', tenantId],
    queryFn: async () => {
      const res = await fetch(`/api/markets?tenantId=${tenantId}`);
      if (!res.ok) throw new Error('Failed to fetch markets');
      return res.json();
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    onSuccess: (data: MarketInfo[]) => {
      setMarkets(data);
    },
  });
}
