'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

/**
 * AppSidebar — collapsible navigation sidebar shared by all dashboard pages.
 *
 * Behavior (handled by shadcn Sidebar + SidebarProvider):
 *   Mobile (<768px):    renders as a Sheet (off-canvas drawer)
 *   Medium (768-1024px): collapses to icon-only rail
 *   Large (>1024px):    fully expanded with labels
 *
 * The 400ms smooth collapse animation uses the CSS transition var defined in globals.css.
 *
 * FUTURE: pass tenantId from auth session once Phase 6 is wired in.
 * For now, freshness badges are disabled (no tenantId → useFreshness disabled).
 */
export function AppSidebar() {
  return (
    <Sidebar
      collapsible="icon"
      className="transition-[width] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
    >
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 overflow-hidden">
          {/* Logo mark — always visible */}
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-brand-primary text-xs font-bold text-white">
            IQ
          </div>
          {/* Wordmark — hidden when sidebar collapses to icon rail */}
          <span className="truncate font-heading text-sm font-semibold group-data-[collapsible=icon]:hidden">
            Incremental IQ
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarNav />
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* User avatar placeholder — Phase 6 will wire in auth */}
          <Avatar className="h-8 w-8 flex-shrink-0 group-data-[collapsible=icon]:mx-auto">
            <AvatarFallback className="text-xs">U</AvatarFallback>
          </Avatar>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
