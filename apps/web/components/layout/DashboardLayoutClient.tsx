'use client';

import * as React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { StaleDataBanner } from '@/components/dashboard/StaleDataBanner';
import { ExportProvider } from '@/lib/export/context';
import { useDashboardStore } from '@/lib/store/dashboard';
import { TenantProvider } from '@/lib/auth/tenant-context';

interface DashboardLayoutClientProps {
  tenantId: string;
  user: {
    name: string;
    email: string;
  };
  children: React.ReactNode;
}

/**
 * DashboardLayoutClient — client component that wraps the dashboard UI.
 *
 * Receives tenantId from the server component parent (DashboardLayout) which
 * validated the session via auth.api.getSession(). This component handles all
 * client-side concerns: Zustand rehydration, sidebar state, stale data banner.
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
export function DashboardLayoutClient({
  tenantId,
  user,
  children,
}: DashboardLayoutClientProps) {
  React.useEffect(() => {
    // Rehydrate persisted Zustand state (viewMode, kpiOrder) after mount
    useDashboardStore.persist.rehydrate();
  }, []);

  return (
    <TenantProvider tenantId={tenantId}>
      <ExportProvider>
        <SidebarProvider defaultOpen={true}>
          <AppSidebar user={user} />
          <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
            <AppHeader />
            <main className="flex-1 overflow-auto p-4 sm:p-6">
              <div className="mx-auto max-w-7xl space-y-4">
                {/* Stale data banner — shown when any integration >24h stale */}
                <StaleDataBanner />
                {children}
              </div>
            </main>
          </div>
        </SidebarProvider>
      </ExportProvider>
    </TenantProvider>
  );
}
