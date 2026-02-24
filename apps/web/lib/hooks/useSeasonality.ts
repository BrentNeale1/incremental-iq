'use client';

import { useQuery } from '@tanstack/react-query';

export interface SeasonalEvent {
  id: string;
  name: string;
  eventDate: string;
  windowBefore: string | null;
  windowAfter: string | null;
  isUserDefined: boolean;
  year: string | null;
  weeksUntil: number;
  daysUntil: number;
}

export interface HistoricalPerformance {
  eventName: string;
  year: number;
  periodFrom: string;
  periodTo: string;
  totalSpend: number;
  totalRevenue: number;
  roas: number;
}

export interface SeasonalityData {
  upcoming: SeasonalEvent[];
  historical: HistoricalPerformance[];
}

/**
 * useSeasonality — fetches seasonal events and historical performance.
 *
 * Endpoint: GET /api/dashboard/seasonality?tenantId=X&months=6
 * Returns: { upcoming: SeasonalEvent[], historical: HistoricalPerformance[] }
 *
 * queryKey: ['seasonality', tenantId, months]
 * staleTime: 30 minutes — seasonal data changes rarely
 */
export function useSeasonality(tenantId: string | undefined, months = 6) {
  return useQuery<SeasonalityData>({
    queryKey: ['seasonality', tenantId, months],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
        months: String(months),
      });
      const res = await fetch(`/api/dashboard/seasonality?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch seasonality data: ${res.status}`);
      }
      return res.json() as Promise<SeasonalityData>;
    },
    enabled: !!tenantId,
    staleTime: 30 * 60 * 1000,
  });
}
