'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon, ChevronRightIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/lib/store/dashboard';

/** Campaign row as returned by /api/dashboard/campaigns */
export interface ApiCampaignRow {
  id: string;
  name: string;
  platform: string;
  funnelStage: string | null;
  spend: number;
  revenue: number;
  roas: number;
  liftMean: number | null;
  liftLower: number | null;
  liftUpper: number | null;
  confidence: number | null;
  status: string | null;
  isRollup: boolean;
}

type DrillLevel = 'campaign' | 'cluster' | 'channel' | 'overall';
type SortKey = keyof Pick<ApiCampaignRow, 'name' | 'spend' | 'revenue' | 'roas' | 'liftMean' | 'confidence'>;
type SortDir = 'asc' | 'desc';

const LEVEL_LABELS: Record<DrillLevel, string> = {
  campaign: 'Campaign',
  cluster: 'Cluster',
  channel: 'Channel',
  overall: 'Overall',
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  google_ads: 'Google',
  shopify: 'Shopify',
  all: 'All',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sufficient: { label: 'Sufficient', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  insufficient: { label: 'Insufficient', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  low_spend: { label: 'Low Spend', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
};

function useCampaignData(
  tenantId: string | undefined,
  dateRange: DateRange,
  platform: string | undefined,
  level: DrillLevel,
) {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  return useQuery<ApiCampaignRow[]>({
    queryKey: ['campaigns-table', tenantId, from, to, platform, level],
    queryFn: async () => {
      const params = new URLSearchParams({
        tenantId: tenantId!,
        from,
        to,
        ...(platform && platform !== 'all' ? { platform } : {}),
        level,
      });
      const res = await fetch(`/api/dashboard/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch campaigns: ${res.status}`);
      return res.json() as Promise<ApiCampaignRow[]>;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}

function fmt(value: number, type: 'currency' | 'percent' | 'roas' | 'lift') {
  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
        notation: value >= 10_000 ? 'compact' : 'standard',
        compactDisplay: 'short',
      }).format(value);
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'roas':
      return `${value.toFixed(2)}x`;
    case 'lift':
      return `${(value * 100).toFixed(1)}pp`;
    default:
      return String(value);
  }
}

interface SortButtonProps {
  column: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
  children: React.ReactNode;
}

function SortButton({ column, currentKey, currentDir, onSort, children }: SortButtonProps) {
  const isActive = currentKey === column;
  return (
    <button
      className="flex items-center gap-1 hover:text-foreground"
      onClick={() => onSort(column)}
      aria-sort={isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {children}
      {isActive ? (
        currentDir === 'asc' ? (
          <ChevronUpIcon className="h-3 w-3" />
        ) : (
          <ChevronDownIcon className="h-3 w-3" />
        )
      ) : (
        <ChevronDownIcon className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

interface CampaignTableProps {
  tenantId: string | undefined;
  dateRange: DateRange;
  platform?: string;
}

/**
 * CampaignTable — multi-level drill-down table for campaign performance.
 *
 * Supports level switching: campaign | cluster | channel | overall (RPRT-03)
 * Columns: Name, Platform, Funnel Stage, Spend, Revenue, ROAS, Lift, Confidence, Status
 * Client-side sort on any column.
 * Comfortable table spacing with hover highlights.
 */
export function CampaignTable({ tenantId, dateRange, platform }: CampaignTableProps) {
  const [level, setLevel] = React.useState<DrillLevel>('campaign');
  const [sortKey, setSortKey] = React.useState<SortKey | null>('spend');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const { data: rows, isLoading, isError } = useCampaignData(tenantId, dateRange, platform, level);

  const sorted = React.useMemo(() => {
    if (!rows) return [];
    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      const aVal = a[sortKey] ?? -Infinity;
      const bVal = b[sortKey] ?? -Infinity;
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return dir * aVal.localeCompare(bVal);
      }
      return dir * (Number(aVal) - Number(bVal));
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleLevelChange(newLevel: DrillLevel) {
    setLevel(newLevel);
    setExpandedRows(new Set());
  }

  const LEVELS: DrillLevel[] = ['campaign', 'cluster', 'channel', 'overall'];

  return (
    <div className="space-y-3">
      {/* Drill-down level selector */}
      <div className="flex items-center gap-1">
        <span className="mr-2 text-xs font-medium text-muted-foreground">View by:</span>
        {LEVELS.map((l) => (
          <Button
            key={l}
            variant={level === l ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-3 text-xs capitalize"
            onClick={() => handleLevelChange(l)}
          >
            {LEVEL_LABELS[l]}
          </Button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[260px] pl-4">
                <SortButton column="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead className="text-right">
                <SortButton column="spend" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Spend</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="revenue" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Revenue</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="roas" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">ROAS</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="liftMean" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Lift</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="confidence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Conf.</span>
                </SortButton>
              </TableHead>
              <TableHead className="pr-4">Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j} className={j === 0 ? 'pl-4' : j === 8 ? 'pr-4' : ''}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  Unable to load campaign data.
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No campaigns found for this {level} view.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                const platformLabel = PLATFORM_LABELS[row.platform.toLowerCase()] ?? row.platform;
                const statusInfo = row.status ? STATUS_CONFIG[row.status] : null;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        'h-12 cursor-pointer hover:bg-muted/50',
                        isExpanded && 'bg-muted/30',
                      )}
                      onClick={() => level !== 'campaign' && toggleExpand(row.id)}
                    >
                      {/* Name */}
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          {level !== 'campaign' && (
                            <ChevronRightIcon
                              className={cn(
                                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                                isExpanded && 'rotate-90',
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              'truncate text-sm font-medium',
                              row.isRollup && 'text-muted-foreground',
                            )}
                          >
                            {row.name}
                          </span>
                        </div>
                      </TableCell>

                      {/* Platform */}
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {platformLabel}
                        </Badge>
                      </TableCell>

                      {/* Funnel Stage */}
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {row.funnelStage ?? '—'}
                      </TableCell>

                      {/* Spend */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(row.spend, 'currency')}
                      </TableCell>

                      {/* Revenue */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {fmt(row.revenue, 'currency')}
                      </TableCell>

                      {/* ROAS */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.roas > 0 ? fmt(row.roas, 'roas') : '—'}
                      </TableCell>

                      {/* Lift */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.liftMean != null ? (
                          <span
                            className={cn(
                              row.liftMean > 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {fmt(row.liftMean, 'lift')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Confidence */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.confidence != null ? (
                          <span
                            className={cn(
                              row.confidence >= 0.8
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : row.confidence >= 0.5
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-red-600 dark:text-red-400',
                            )}
                          >
                            {fmt(row.confidence, 'percent')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="pr-4">
                        {statusInfo ? (
                          <Badge
                            variant="outline"
                            className={cn('text-xs', statusInfo.className)}
                          >
                            {statusInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>

                    {/* Expanded sub-rows placeholder — future enhancement */}
                    {isExpanded && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={9} className="py-2 pl-10 text-xs text-muted-foreground">
                          Campaign-level detail will appear here in a future release.
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Row count */}
      {sorted.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {sorted.length} {LEVEL_LABELS[level].toLowerCase()} row
          {sorted.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
