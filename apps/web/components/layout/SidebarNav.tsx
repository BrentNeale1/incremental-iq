'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Calendar,
  Activity,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { cn } from '@/lib/utils';

const navItems = [
  {
    label: 'Executive Overview',
    icon: LayoutDashboard,
    href: '/',
  },
  {
    label: 'Marketing Performance',
    icon: TrendingUp,
    href: '/performance',
  },
  {
    label: 'Statistical Insights',
    icon: BarChart3,
    href: '/insights',
  },
  {
    label: 'Seasonality Planning',
    icon: Calendar,
    href: '/seasonality',
  },
  {
    label: 'Data Health',
    icon: Activity,
    href: '/health',
  },
];

/** Maps a route path to an integration platform for freshness badge display. */
const routePlatformMap: Record<string, string[]> = {
  '/': [],           // Executive Overview — shows global status
  '/performance': ['meta', 'google'],
  '/insights': ['meta', 'google'],
  '/seasonality': [],
  '/health': ['meta', 'google', 'shopify'],
};

function FreshnessDot({ status }: { status: 'healthy' | 'warning' | 'error' | 'unknown' }) {
  return (
    <span
      className={cn(
        'h-2 w-2 rounded-full flex-shrink-0',
        status === 'healthy' && 'bg-brand-success',
        status === 'warning' && 'bg-brand-warning',
        status === 'error' && 'bg-brand-danger',
        status === 'unknown' && 'bg-muted-foreground/40',
      )}
      title={`Integration status: ${status}`}
    />
  );
}

/**
 * SidebarNav renders the 5 navigation items with freshness indicator dots.
 *
 * Freshness dots reflect global integration health (green/yellow/red).
 * Per-route granularity is a future enhancement; current implementation
 * shows global status on all items for simplicity.
 *
 * tenantId is no longer accepted — the API route reads it from the session cookie.
 */
export function SidebarNav() {
  const pathname = usePathname();
  const { data: freshnessData } = useFreshness();

  const globalStatus = freshnessData?.globalStatus ?? 'unknown';

  // Map global status to dot status
  const dotStatus: 'healthy' | 'warning' | 'error' | 'unknown' =
    globalStatus === 'healthy'
      ? 'healthy'
      : globalStatus === 'warning'
        ? 'warning'
        : globalStatus === 'error'
          ? 'error'
          : 'unknown';

  return (
    <SidebarMenu>
      {navItems.map((item) => {
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.label}
            >
              <Link href={item.href} className="flex items-center gap-2">
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                <FreshnessDot status={dotStatus} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
