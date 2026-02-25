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
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 * Middleware ensures the user is authenticated before reaching dashboard pages.
 *
 * Endpoint: GET /api/dashboard/seasonality?months=6
 * Returns: { upcoming: SeasonalEvent[], historical: HistoricalPerformance[] }
 *
 * queryKey: ['seasonality', months]
 * staleTime: 30 minutes — seasonal data changes rarely
 */
export function useSeasonality(months = 6) {
  return useQuery<SeasonalityData>({
    queryKey: ['seasonality', months],
    queryFn: async () => {
      const params = new URLSearchParams({
        months: String(months),
      });
      const res = await fetch(`/api/dashboard/seasonality?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch seasonality data: ${res.status}`);
      }
      return res.json() as Promise<SeasonalityData>;
    },
    staleTime: 30 * 60 * 1000,
  });
}
