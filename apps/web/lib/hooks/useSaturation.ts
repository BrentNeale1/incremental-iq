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
 * Shape returned by the API when a campaignId is provided (detail mode).
 * The API route returns { campaign, curvePoints, currentSpendLevel } — not an array.
 */
interface SaturationDetailResponse {
  campaign: {
    campaignId: string;
    campaignName: string | null;
    platform: string | null;
    saturationPct: number | null;
    hillAlpha: number | null;
    hillMu: number | null;
    hillGamma: number | null;
    status: string;
    estimatedAt: string;
  };
  curvePoints: Array<{ spendLevel: number; revenue: number; isCurrentSpend: boolean }>;
  currentSpendLevel: number;
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
 *
 * Normalizes both API response shapes into SaturationCurve[]:
 *   - Overview mode (no campaignId): API returns SaturationRow[] — passed through directly
 *   - Detail mode (with campaignId): API returns SaturationDetailResponse object — mapped to single-element array
 *
 * This guarantees consumers always receive an array and can safely call .find() / .map().
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
      const json = await res.json();

      // Normalize: detail mode returns { campaign, curvePoints, currentSpendLevel }
      // Overview mode returns SaturationCurve[] (array of row objects)
      if (Array.isArray(json)) {
        // Overview mode — map API field names to SaturationCurve interface
        return (json as Array<{
          campaignId: string;
          campaignName: string | null;
          platform: string | null;
          saturationPct: number | null;
          hillAlpha: number | null;
          hillMu: number | null;
          hillGamma: number | null;
          status: string;
          estimatedAt: string;
        }>).map((row) => ({
          campaignId: row.campaignId,
          campaignName: row.campaignName ?? '',
          platform: row.platform ?? '',
          alpha: row.hillAlpha,
          mu: row.hillMu,
          gamma: row.hillGamma,
          saturationPercent: row.saturationPct,
          status: row.status as SaturationCurve['status'],
          scoredAt: row.estimatedAt,
        }));
      }

      // Detail mode — extract campaign object and map to single-element SaturationCurve array
      const detail = json as SaturationDetailResponse;
      const c = detail.campaign;
      if (c) {
        return [{
          campaignId: c.campaignId,
          campaignName: c.campaignName ?? '',
          platform: c.platform ?? '',
          alpha: c.hillAlpha,
          mu: c.hillMu,
          gamma: c.hillGamma,
          saturationPercent: c.saturationPct,
          status: c.status as SaturationCurve['status'],
          scoredAt: c.estimatedAt,
        }] as SaturationCurve[];
      }

      return [] as SaturationCurve[];
    },
    staleTime: 10 * 60 * 1000,
  });
}
