'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/auth-client';

interface AppSidebarProps {
  user: {
    name: string;
    email: string;
  };
}

/**
 * Derive user initials from a display name.
 * "Jane Smith" → "JS", "Alice" → "AL", "" → "U"
 */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
 * Footer: user avatar with initials, name, and email. Clicking opens a
 * dropdown with a "Log out" option. Works in both expanded and collapsed states.
 *
 * Logout pattern (Pattern 7 from RESEARCH.md):
 *   - authClient.signOut() revokes the session in the database immediately
 *   - router.push("/login") redirects the user
 *   - router.refresh() clears the Next.js router cache (Pitfall 2 prevention)
 */
export function AppSidebar({ user }: AppSidebarProps) {
  const router = useRouter();
  const initials = getInitials(user.name);

  async function handleSignOut() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/login');
          router.refresh(); // CRITICAL: clears Next.js router cache (Pitfall 2)
        },
      },
    });
  }

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

          {/* User menu — avatar trigger + dropdown with Log out */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 hover:bg-sidebar-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:flex-none"
                aria-label="User menu"
              >
                {/* Avatar — always visible */}
                <Avatar className="h-7 w-7 flex-shrink-0">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>

                {/* Name + email — hidden when collapsed to icon rail */}
                <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-xs font-medium leading-tight">
                    {user.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground leading-tight">
                    {user.email}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="end" className="w-44">
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
