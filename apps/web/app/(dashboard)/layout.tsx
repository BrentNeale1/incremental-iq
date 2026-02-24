'use client';

import * as React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { StaleDataBanner } from '@/components/dashboard/StaleDataBanner';
import { ExportProvider } from '@/lib/export/context';
import { useDashboardStore } from '@/lib/store/dashboard';

/**
 * PLACEHOLDER tenant ID — Phase 6 (auth) will supply real tenant from session.
 */
const PLACEHOLDER_TENANT_ID = undefined;

/**
 * Dashboard route group layout — shared by all 5 dashboard pages.
 *
 * Structure:
 *   <SidebarProvider>
 *     <AppSidebar />  (collapsible navigation)
 *     <main>
 *       <AppHeader />  (date range, comparison, view toggle, notifications)
 *       <StaleDataBanner />  (amber warning when any integration is stale)
 *       {children}     (page content)
 *     </main>
 *   </SidebarProvider>
 *
 * CRITICAL (Pitfall 2): Zustand `skipHydration: true` is set on the dashboard
 * store, so we must call `persist.rehydrate()` here after mount. This prevents
 * the SSR hydration mismatch where the server-rendered HTML uses default state
 * but the client immediately loads persisted state.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    // Rehydrate persisted Zustand state (viewMode, kpiOrder) after mount
    useDashboardStore.persist.rehydrate();
  }, []);

  return (
    <ExportProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-7xl space-y-4">
              {/* Stale data banner — shown when any integration >24h stale */}
              <StaleDataBanner tenantId={PLACEHOLDER_TENANT_ID} />
              {children}
            </div>
          </main>
        </div>
      </SidebarProvider>
    </ExportProvider>
  );
}
