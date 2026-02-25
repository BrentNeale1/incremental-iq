'use client';

import { useQuery } from '@tanstack/react-query';
import type { Recommendation } from '@/lib/recommendations/types';

/**
 * useRecommendations — fetches all recommendations for a tenant.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Returns recommendations sorted by expectedImpact DESC.
 * queryKey: ['recommendations']
 * staleTime: 5 minutes
 */
export function useRecommendations() {
  return useQuery<Recommendation[]>({
    queryKey: ['recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/recommendations');
      if (!res.ok) {
        throw new Error(`Failed to fetch recommendations: ${res.status}`);
      }
      return res.json() as Promise<Recommendation[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
