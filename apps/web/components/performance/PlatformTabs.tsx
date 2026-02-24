'use client';

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlatformOverview } from '@/components/performance/PlatformOverview';
import { CampaignTable } from '@/components/performance/CampaignTable';
import type { DateRange } from '@/lib/store/dashboard';

type PlatformFilter = 'all' | 'meta' | 'google';

const PLATFORM_TABS: { value: PlatformFilter; label: string }[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'meta', label: 'Meta Ads' },
  { value: 'google', label: 'Google Ads' },
];

interface PlatformTabsProps {
  tenantId: string | undefined;
  dateRange: DateRange;
}

/**
 * PlatformTabs — three tabs: All Platforms, Meta Ads, Google Ads.
 *
 * Selecting a tab filters the PlatformOverview metric cards and CampaignTable
 * below it. State is local to this component — no URL param needed.
 *
 * Per user decision: platform-specific views under each tab.
 */
export function PlatformTabs({ tenantId, dateRange }: PlatformTabsProps) {
  const [activePlatform, setActivePlatform] = React.useState<PlatformFilter>('all');

  return (
    <Tabs
      value={activePlatform}
      onValueChange={(v) => setActivePlatform(v as PlatformFilter)}
    >
      <TabsList>
        {PLATFORM_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {PLATFORM_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4 space-y-4">
          <PlatformOverview
            tenantId={tenantId}
            dateRange={dateRange}
            platform={tab.value === 'all' ? undefined : tab.value}
          />
          <CampaignTable
            tenantId={tenantId}
            dateRange={dateRange}
            platform={tab.value === 'all' ? undefined : tab.value}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
