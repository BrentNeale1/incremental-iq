'use client';

import { useQuery } from '@tanstack/react-query';
import type { Recommendation } from '@/lib/recommendations/types';
import { useDashboardStore } from '@/lib/store/dashboard';

/**
 * useRecommendations — fetches all recommendations for a tenant,
 * then filters client-side by the selected market via TanStack Query select.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Returns recommendations sorted by expectedImpact DESC, filtered by selectedMarket.
 * queryKey: ['recommendations'] — STABLE (no market in key — avoids per-market refetch)
 * staleTime: 5 minutes
 *
 * The full unfiltered set is always fetched and cached under ['recommendations'].
 * Switching markets performs instant client-side filtering via the select option.
 */
export function useRecommendations() {
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);

  return useQuery<Recommendation[], Error, Recommendation[]>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) {
        throw new Error(`Failed to fetch recommendations: ${res.status}`);
      }
      return res.json() as Promise<Recommendation[]>;
    },
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      if (!selectedMarket) return data;
      return data.filter((r) => r.marketId === selectedMarket);
    },
  });
}
