'use client';

import { useEffect, useMemo } from 'react';
import { useDashboardStore } from '@/lib/store/dashboard';
import type { OutcomeMode } from '@/lib/store/dashboard';

/** Display terminology that changes based on outcome mode. */
interface OutcomeTerms {
  revenue: string;
  incrementalRevenue: string;
  conversion: string;
}

const TERMS: Record<OutcomeMode, OutcomeTerms> = {
  ecommerce: {
    revenue: 'Revenue',
    incrementalRevenue: 'Incremental Revenue',
    conversion: 'Sale',
  },
  lead_gen: {
    revenue: 'Leads',
    incrementalRevenue: 'Incremental Leads',
    conversion: 'Lead',
  },
};

/**
 * Hook providing outcome mode and mode-appropriate display terminology.
 *
 * Loads outcome mode from /api/tenant/preferences on mount and updates the
 * Zustand store. Components use `terms` to render "Revenue" vs "Leads" etc.
 *
 * @param tenantId - Tenant UUID (undefined skips fetch).
 */
export function useOutcomeMode(tenantId: string | undefined) {
  const outcomeMode = useDashboardStore((s) => s.outcomeMode);
  const setOutcomeMode = useDashboardStore((s) => s.setOutcomeMode);

  useEffect(() => {
    if (!tenantId) return;

    fetch(`/api/tenant/preferences?tenantId=${tenantId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch preferences');
        return res.json();
      })
      .then((data: { outcomeMode: OutcomeMode }) => {
        setOutcomeMode(data.outcomeMode);
      })
      .catch(() => {
        // Non-fatal — keep default 'ecommerce'
      });
  }, [tenantId, setOutcomeMode]);

  const terms = useMemo(() => TERMS[outcomeMode], [outcomeMode]);

  return { outcomeMode, terms };
}
