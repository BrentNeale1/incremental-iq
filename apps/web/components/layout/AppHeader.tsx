'use client';

import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/dashboard/DateRangePicker';
import { ComparisonToggle } from '@/components/dashboard/ComparisonToggle';
import { ViewToggle } from '@/components/dashboard/ViewToggle';

/** Maps pathnames to human-readable page titles. */
const PAGE_TITLES: Record<string, string> = {
  '/': 'Executive Overview',
  '/performance': 'Marketing Performance',
  '/insights': 'Statistical Insights',
  '/seasonality': 'Seasonality Planning',
  '/health': 'Data Health',
};

/**
 * AppHeader — sticky top bar shared by all dashboard pages.
 *
 * Contains:
 *   - SidebarTrigger (hamburger) on mobile
 *   - Dynamic page title from current pathname
 *   - DateRangePicker with 4 presets + custom calendar
 *   - ComparisonToggle (shows secondary DateRangePicker when enabled)
 *   - ViewToggle (Executive / Analyst)
 *   - Notification bell placeholder (wired in Plan 06)
 */
export function AppHeader() {
  const pathname = usePathname();
  const title = PAGE_TITLES[pathname] ?? 'Dashboard';

  return (
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

        {/* Notification bell placeholder — Plan 06 */}
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Notifications">
          <Bell className="h-4 w-4" />
          <span className="sr-only">Notifications</span>
        </Button>
      </div>
    </header>
  );
}
