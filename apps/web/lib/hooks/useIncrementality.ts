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
 * Optional campaignId narrows to a single campaign's time series for overlay charts.
 * scoreType defaults to 'adjusted' (seasonally corrected).
 *
 * queryKey includes all params so refetch fires when selection changes.
 * staleTime: 5 minutes
 */
export function useIncrementality(
  tenantId: string | undefined,
  campaignId?: string,
  scoreType: 'adjusted' | 'raw' = 'adjusted',
) {
  return useQuery<IncrementalityScore[]>({
    queryKey: ['incrementality', tenantId, campaignId, scoreType],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
        scoreType,
        ...(campaignId ? { campaignId } : {}),
      });
      const res = await fetch(`/api/dashboard/incrementality?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch incrementality: ${res.status}`);
      }
      return res.json() as Promise<IncrementalityScore[]>;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
