'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { DateRange } from '@/lib/store/dashboard';

export interface CampaignRow {
  campaignId: string;
  campaignName: string;
  platform: string;
  spend: number;
  directRevenue: number;
  modeledRevenue: number;
  roas: number;
  incrementalRevenue: number;
  liftPct: number | null;
}

/**
 * useCampaigns — fetches campaign-level metrics from /api/dashboard/campaigns.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Optional filters:
 *   platform — filter by ad platform ('meta' | 'google' | 'shopify')
 *   level    — aggregation level ('campaign' | 'adset' | 'ad')
 *
 * queryKey includes all params so refetch fires when filters change.
 * staleTime: 5 minutes
 */
export function useCampaigns(
  dateRange: DateRange,
  platform?: string,
  level?: string,
) {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  return useQuery<CampaignRow[]>({
    queryKey: ['campaigns', from, to, platform, level],
    queryFn: async () => {
      const params = new URLSearchParams({
        from,
        to,
        ...(platform ? { platform } : {}),
        ...(level ? { level } : {}),
      });

      const res = await fetch(`/api/dashboard/campaigns?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch campaigns: ${res.status}`);
      }
      return res.json() as Promise<CampaignRow[]>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
