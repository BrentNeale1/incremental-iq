'use client';

import { useQuery } from '@tanstack/react-query';

export interface SaturationCurve {
  campaignId: string;
  campaignName: string;
  platform: string;
  alpha: number | null;
  mu: number | null;
  gamma: number | null;
  saturationPercent: number | null;
  status: 'estimated' | 'insufficient_variation' | 'error';
  scoredAt: string;
}

/**
 * useSaturation — fetches Hill saturation curve parameters from /api/dashboard/saturation.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Optional campaignId narrows to a single campaign's saturation curve.
 *
 * queryKey includes all params so refetch fires when campaign selection changes.
 * staleTime: 10 minutes (saturation curves change slowly)
 */
export function useSaturation(campaignId?: string) {
  return useQuery<SaturationCurve[]>({
    queryKey: ['saturation', campaignId],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(campaignId ? { campaignId } : {}),
      });
      const res = await fetch(`/api/dashboard/saturation?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch saturation: ${res.status}`);
      }
      return res.json() as Promise<SaturationCurve[]>;
    },
    staleTime: 10 * 60 * 1000,
  });
}
