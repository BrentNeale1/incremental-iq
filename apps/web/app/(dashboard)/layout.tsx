'use client';

import * as React from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { useDashboardStore } from '@/lib/store/dashboard';

/**
 * Dashboard route group layout — shared by all 5 dashboard pages.
 *
 * Structure:
 *   <SidebarProvider>
 *     <AppSidebar />  (collapsible navigation)
 *     <main>
 *       <AppHeader />  (date range, comparison, view toggle, notifications)
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
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <AppHeader />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
