'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DateRange } from '@/lib/store/dashboard';
import type { ApiCampaignRow } from '@/components/performance/CampaignTable';

interface PlatformStats {
  totalSpend: number;
  totalRevenue: number;
  avgRoas: number;
  campaignCount: number;
}

function usePlatformStats(
  tenantId: string | undefined,
  dateRange: DateRange,
  platform: string | undefined,
): { data: PlatformStats | undefined; isLoading: boolean } {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  const { data: rows, isLoading } = useQuery<ApiCampaignRow[]>({
    queryKey: ['campaigns-table', tenantId, from, to, platform, 'campaign'],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
        from,
        to,
        ...(platform && platform !== 'all' ? { platform } : {}),
        level: 'campaign',
      });
      const res = await fetch(`/api/dashboard/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json() as Promise<ApiCampaignRow[]>;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });

  const data = React.useMemo<PlatformStats | undefined>(() => {
    if (!rows) return undefined;
    const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const avgRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
    return {
      totalSpend,
      totalRevenue,
      avgRoas,
      campaignCount: rows.length,
    };
  }, [rows]);

  return { data, isLoading };
}

interface StatCardProps {
  label: string;
  value: string;
  isLoading: boolean;
}

function StatCard({ label, value, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-6 w-20" />
        ) : (
          <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface PlatformOverviewProps {
  tenantId: string | undefined;
  dateRange: DateRange;
  platform?: string;
}

/**
 * PlatformOverview — summary metric cards for the selected platform.
 *
 * Shows: Total Spend, Total Revenue, Avg ROAS, Campaign Count
 * Data reuses the same TanStack Query cache as CampaignTable (level=campaign).
 */
export function PlatformOverview({ tenantId, dateRange, platform }: PlatformOverviewProps) {
  const { data: stats, isLoading } = usePlatformStats(tenantId, dateRange, platform);

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
      notation: v >= 10_000 ? 'compact' : 'standard',
      compactDisplay: 'short',
    }).format(v);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total Spend"
        value={stats ? fmtCurrency(stats.totalSpend) : '—'}
        isLoading={isLoading}
      />
      <StatCard
        label="Total Revenue"
        value={stats ? fmtCurrency(stats.totalRevenue) : '—'}
        isLoading={isLoading}
      />
      <StatCard
        label="Avg ROAS"
        value={stats ? `${stats.avgRoas.toFixed(2)}x` : '—'}
        isLoading={isLoading}
      />
      <StatCard
        label="Campaigns"
        value={stats ? String(stats.campaignCount) : '—'}
        isLoading={isLoading}
      />
    </div>
  );
}
