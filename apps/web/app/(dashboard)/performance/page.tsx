'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { useDashboardStore } from '@/lib/store/dashboard';
import { useExportContext } from '@/lib/export/context';
import { useCampaigns } from '@/lib/hooks/useCampaigns';
import { PriorityQueue } from '@/components/performance/PriorityQueue';
import { PlatformTabs } from '@/components/performance/PlatformTabs';

/**
 * Marketing Performance page — action-oriented campaign management.
 *
 * Layout (per design spec: "practical, action-oriented — less stats, more here's what to do"):
 *   Section 1 — Priority Queue: urgent campaign actions ranked by urgency + impact
 *   Section 2 — Platform Tabs: All/Meta/Google views with overview metrics + campaign table
 *
 * Progressive loading: sections load independently with skeleton placeholders.
 * Mobile-responsive: full-width sections, tables horizontally scroll on mobile.
 * tenantId comes from session cookie automatically — no PLACEHOLDER_TENANT_ID.
 */
export default function MarketingPerformancePage() {
  const dateRange = useDashboardStore((s) => s.dateRange);
  const { data: campaignRows } = useCampaigns(dateRange);
  const { setExportData } = useExportContext();
  React.useEffect(() => {
    if (campaignRows && campaignRows.length > 0) {
      setExportData(
        campaignRows as unknown as Record<string, unknown>[],
        `performance-${format(dateRange.from, 'yyyy-MM-dd')}`,
      );
    }
  }, [campaignRows, dateRange.from, setExportData]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Section 1 — Priority Queue */}
      <section aria-label="Urgent campaign actions">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Priority Actions
        </h2>
        <PriorityQueue />
      </section>

      {/* Section 2 — Platform tabs with overview + table */}
      <section aria-label="Campaign performance by platform">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Campaign Performance
        </h2>
        {/* Horizontal scroll wrapper ensures table is usable on mobile */}
        <div className="overflow-x-auto">
          <PlatformTabs dateRange={dateRange} />
        </div>
      </section>
    </div>
  );
}
