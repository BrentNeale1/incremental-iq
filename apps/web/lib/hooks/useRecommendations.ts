'use client';

import { useQuery } from '@tanstack/react-query';
import type { Recommendation } from '@/lib/recommendations/types';

/**
 * useRecommendations — fetches all recommendations for a tenant.
 *
 * Returns recommendations sorted by expectedImpact DESC.
 * queryKey: ['recommendations', tenantId]
 * staleTime: 5 minutes
 */
export function useRecommendations(tenantId: string | undefined) {
  return useQuery<Recommendation[]>({
    queryKey: ['recommendations', tenantId],
    queryFn: async () => {
      const params = new URLSearchParams({ tenantId: tenantId! });
      const res = await fetch(`/api/recommendations?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch recommendations: ${res.status}`);
      }
      return res.json() as Promise<Recommendation[]>;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
