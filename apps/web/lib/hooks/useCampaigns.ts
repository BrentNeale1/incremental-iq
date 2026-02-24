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
 * Optional filters:
 *   platform — filter by ad platform ('meta' | 'google' | 'shopify')
 *   level    — aggregation level ('campaign' | 'adset' | 'ad')
 *
 * queryKey includes all params so refetch fires when filters change.
 * staleTime: 5 minutes
 */
export function useCampaigns(
  tenantId: string | undefined,
  dateRange: DateRange,
  platform?: string,
  level?: string,
) {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  return useQuery<CampaignRow[]>({
    queryKey: ['campaigns', tenantId, from, to, platform, level],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
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
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
