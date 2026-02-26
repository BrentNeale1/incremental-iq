'use client';

import { useQuery } from '@tanstack/react-query';

/**
 * useForecast — fetches Prophet forecast data for a specific campaign.
 *
 * Returns historical fitted values (yhat for past dates), future predictions,
 * and actual observed revenue values from campaign_metrics.
 *
 * Enabled only when campaignId is provided.
 * staleTime: 10 minutes — forecast data is expensive to compute.
 * Returns empty arrays when Python service is unavailable (graceful degradation).
 */

export interface ForecastPoint {
  date: string;
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
}

export interface ActualPoint {
  date: string;
  value: number;
}

export interface ForecastData {
  historical: ForecastPoint[];
  future: ForecastPoint[];
  actuals: ActualPoint[];
}

const EMPTY_FORECAST: ForecastData = {
  historical: [],
  future: [],
  actuals: [],
};

export function useForecast(campaignId: string | undefined) {
  return useQuery<ForecastData>({
    queryKey: ['forecast', campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/forecast?campaignId=${campaignId}`);
      if (!res.ok) {
        // Return empty data rather than throwing — graceful degradation in chart
        return EMPTY_FORECAST;
      }
      return res.json() as Promise<ForecastData>;
    },
    enabled: !!campaignId,
    staleTime: 10 * 60 * 1000,
  });
}
