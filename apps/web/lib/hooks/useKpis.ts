'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import type { DateRange } from '@/lib/store/dashboard';

interface KpiAggregate {
  spend: number;
  revenue: number;
  roas: number;
  incrementalRevenue: number;
  liftPct: number;
}

export interface KpisResponse {
  period: KpiAggregate;
  comparison?: {
    period: KpiAggregate;
    spendDelta: number;
    spendDeltaPct: number;
    revenueDelta: number;
    revenueDeltaPct: number;
    roasDelta: number;
    roasDeltaPct: number;
    incrementalRevenueDelta: number;
    incrementalRevenueDeltaPct: number;
    liftPctDelta: number;
  };
}

/**
 * useKpis — fetches aggregated KPI data from /api/dashboard/kpis.
 *
 * queryKey includes all date params so refetch fires when ranges change.
 * staleTime: 5 minutes — KPI aggregates don't need real-time updates.
 */
export function useKpis(
  tenantId: string | undefined,
  dateRange: DateRange,
  comparisonRange?: DateRange | null,
) {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');
  const compareFrom = comparisonRange ? format(comparisonRange.from, 'yyyy-MM-dd') : undefined;
  const compareTo = comparisonRange ? format(comparisonRange.to, 'yyyy-MM-dd') : undefined;

  return useQuery<KpisResponse>({
    queryKey: ['kpis', tenantId, from, to, compareFrom, compareTo],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
        from,
        to,
        ...(compareFrom && compareTo ? { compareFrom, compareTo } : {}),
      });

      const res = await fetch(`/api/dashboard/kpis?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch KPIs: ${res.status}`);
      }
      return res.json() as Promise<KpisResponse>;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
