'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { ComparisonToggle } from '@/components/dashboard/ComparisonToggle';
import { ViewToggle } from '@/components/dashboard/ViewToggle';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { ExportButton } from '@/components/dashboard/ExportButton';
import { MarketSelector } from '@/components/layout/MarketSelector';
import { useExportContext } from '@/lib/export/context';

/** Maps pathnames to human-readable page titles. */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Executive Overview',
  '/performance': 'Marketing Performance',
  '/insights': 'Statistical Insights',
  '/seasonality': 'Seasonality Planning',
  '/health': 'Data Health',
};

/**
 * PLACEHOLDER tenant ID — Phase 6 (auth) will supply real tenant from session.
 * Until then, notification polling is disabled (enabled: !!tenantId guard).
 */
const PLACEHOLDER_TENANT_ID = undefined;

/**
 * AppHeader — sticky top bar shared by all dashboard pages.
 *
 * Contains:
 *   - SidebarTrigger (hamburger) on mobile
 *   - Dynamic page title from current pathname
 *   - DateRangePicker with 4 presets + custom calendar
 *   - ComparisonToggle (shows secondary DateRangePicker when enabled)
 *   - ViewToggle (Executive / Analyst)
 *   - NotificationBell with unread count badge (wired in Plan 06)
 *
 * Notification panel: Sheet slide-over from right on all screen sizes.
 */
export function AppHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const { data: exportData, filename: exportFilename } = useExportContext();

  return (
    <>
      <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
        {/* Mobile sidebar trigger */}
        <SidebarTrigger className="-ml-1 md:hidden" />
        <Separator orientation="vertical" className="h-5 md:hidden" />

        {/* Page title */}
        <h1 className="mr-auto text-sm font-semibold">{title}</h1>

        {/* Controls — stacked on small screens, horizontal on md+ */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DateRangePicker />
          <ComparisonToggle />
          <ViewToggle />
          <MarketSelector />

          {/* Export — data provided by active page via ExportProvider context */}
          <ExportButton data={exportData} filename={exportFilename} />

          {/* Notification bell — opens panel */}
          <NotificationBell
            tenantId={PLACEHOLDER_TENANT_ID}
            onOpen={() => setNotificationsOpen(true)}
          />
        </div>
      </header>

      {/* Notification panel — Sheet slide-over from right */}
      <NotificationPanel
        tenantId={PLACEHOLDER_TENANT_ID}
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />
    </>
  );
}
