'use client';

import { useQuery } from '@tanstack/react-query';

export interface IncrementalityScore {
  campaignId: string;
  campaignName: string;
  platform: string;
  scoreType: 'adjusted' | 'raw';
  liftMean: number;
  liftLower: number;
  liftUpper: number;
  confidence: number;
  status: string;
  dataPoints: number;
  scoredAt: string;
}

/**
 * useIncrementality — fetches incrementality scores from /api/dashboard/incrementality.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Optional campaignId narrows to a single campaign's time series for overlay charts.
 * scoreType defaults to 'adjusted' (seasonally corrected).
 *
 * queryKey includes all params so refetch fires when selection changes.
 * staleTime: 5 minutes
 */
export function useIncrementality(
  campaignId?: string,
  scoreType: 'adjusted' | 'raw' = 'adjusted',
  marketId?: string,
) {
  return useQuery<IncrementalityScore[]>({
    queryKey: ['incrementality', campaignId, scoreType, marketId],
    queryFn: async () => {
      const params = new URLSearchParams({
        scoreType,
        ...(campaignId ? { campaignId } : {}),
        ...(marketId ? { marketId } : {}),
      });
      const res = await fetch(`/api/dashboard/incrementality?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch incrementality: ${res.status}`);
      }
      return res.json() as Promise<IncrementalityScore[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
