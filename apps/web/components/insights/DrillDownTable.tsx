'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, FilterIcon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { DateRange } from '@/lib/store/dashboard';

/** Extended campaign row for the drill-down table (statistical columns included) */
export interface DrillDownRow {
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
  saturationPct: number | null;
  status: string | null;
  dataPoints: number | null;
  action: string | null;
  isRollup: boolean;
}

type DrillLevel = 'campaign' | 'cluster' | 'channel' | 'overall';
type SortKey = keyof Pick<DrillDownRow, 'name' | 'spend' | 'revenue' | 'roas' | 'liftMean' | 'confidence' | 'saturationPct'>;
type SortDir = 'asc' | 'desc';

type PresetFilter = 'all' | 'high_confidence' | 'scale_candidates' | 'needs_data';

const LEVEL_LABELS: Record<DrillLevel, string> = {
  campaign: 'Campaign',
  cluster: 'Cluster',
  channel: 'Channel',
  overall: 'Overall',
};

const PRESET_FILTERS: { id: PresetFilter; label: string; description: string }[] = [
  { id: 'all', label: 'All', description: 'Show all campaigns' },
  { id: 'high_confidence', label: 'High Confidence', description: 'Confidence > 65%' },
  { id: 'scale_candidates', label: 'Scale Candidates', description: 'Action: scale_up' },
  { id: 'needs_data', label: 'Needs Data', description: 'Status: insufficient_data' },
];

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  sufficient: { label: 'Sufficient', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  insufficient: { label: 'Insufficient', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  insufficient_data: { label: 'Needs Data', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  low_spend: { label: 'Low Spend', className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200' },
  error: { label: 'Error', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
};

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  google_ads: 'Google',
  shopify: 'Shopify',
};

function useDrillData(
  dateRange: DateRange,
  platform: string | undefined,
  level: DrillLevel,
) {
  const from = format(dateRange.from, 'yyyy-MM-dd');
  const to = format(dateRange.to, 'yyyy-MM-dd');

  return useQuery<DrillDownRow[]>({
    queryKey: ['drill-down', from, to, platform, level],
    queryFn: async () => {
      const params = new URLSearchParams({
        from,
        to,
        level,
        ...(platform && platform !== 'all' ? { platform } : {}),
      });
      const res = await fetch(`/api/dashboard/campaigns?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to fetch campaigns: ${res.status}`);
      // Cast — the API returns ApiCampaignRow; we treat saturationPct + action as optional extras
      return (res.json() as Promise<DrillDownRow[]>);
    },
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

interface DrillDownTableProps {
  dateRange: DateRange;
  onSelectRow?: (row: DrillDownRow) => void;
}

/**
 * DrillDownTable — expanded statistical campaign table for the Statistical Insights page.
 *
 * Columns: Campaign/Group Name, Platform, Funnel Stage, Lift Mean, Lift Lower, Lift Upper,
 *          Confidence, Saturation %, Status, Data Points
 *
 * Features:
 *   - Drill level switching: campaign | cluster | channel | overall
 *   - Expandable rows for cluster and channel views
 *   - Preset filters: High Confidence (>65%), Scale Candidates, Needs Data
 *   - Custom filters: text search, platform dropdown, confidence range
 *
 * Per design spec: RPRT-03 campaign -> cluster -> channel -> overall drill-down.
 * tenantId is no longer needed — the API reads it from the session cookie.
 */
export function DrillDownTable({ dateRange, onSelectRow }: DrillDownTableProps) {
  const [level, setLevel] = React.useState<DrillLevel>('campaign');
  const [sortKey, setSortKey] = React.useState<SortKey | null>('confidence');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  const [selectedRowId, setSelectedRowId] = React.useState<string | null>(null);
  const [presetFilter, setPresetFilter] = React.useState<PresetFilter>('all');
  const [searchText, setSearchText] = React.useState('');
  const [platformFilter, setPlatformFilter] = React.useState<string>('all');
  const [minConfidence, setMinConfidence] = React.useState<number>(0);

  const { data: rows, isLoading, isError } = useDrillData(dateRange, platformFilter !== 'all' ? platformFilter : undefined, level);

  const filtered = React.useMemo(() => {
    if (!rows) return [];
    let result = [...rows];

    // Preset filter
    if (presetFilter === 'high_confidence') {
      result = result.filter((r) => r.confidence != null && r.confidence > 0.65);
    } else if (presetFilter === 'scale_candidates') {
      result = result.filter((r) => r.action === 'scale_up');
    } else if (presetFilter === 'needs_data') {
      result = result.filter(
        (r) => r.status === 'insufficient_data' || r.status === 'insufficient',
      );
    }

    // Text search
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      result = result.filter((r) => r.name.toLowerCase().includes(q));
    }

    // Confidence range
    if (minConfidence > 0) {
      result = result.filter((r) => r.confidence != null && r.confidence >= minConfidence / 100);
    }

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey] ?? -Infinity;
        const bVal = b[sortKey] ?? -Infinity;
        const dir = sortDir === 'asc' ? 1 : -1;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return dir * aVal.localeCompare(bVal);
        }
        return dir * (Number(aVal) - Number(bVal));
      });
    }

    return result;
  }, [rows, presetFilter, searchText, platformFilter, minConfidence, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRowClick(row: DrillDownRow) {
    setSelectedRowId(row.id);
    onSelectRow?.(row);
  }

  function handleLevelChange(newLevel: DrillLevel) {
    setLevel(newLevel);
    setExpandedRows(new Set());
  }

  const LEVELS: DrillLevel[] = ['campaign', 'cluster', 'channel', 'overall'];

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Drill level */}
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Level:</span>
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

        {/* Preset filters */}
        <div className="flex items-center gap-1">
          <FilterIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {PRESET_FILTERS.map((f) => (
            <Button
              key={f.id}
              variant={presetFilter === f.id ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => setPresetFilter(f.id)}
              title={f.description}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Custom filter row */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search campaigns..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="h-8 w-48 text-xs"
        />
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="meta">Meta</SelectItem>
            <SelectItem value="google">Google</SelectItem>
            <SelectItem value="shopify">Shopify</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Min confidence:</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            className="w-24"
          />
          <span className="w-8 text-right">{minConfidence}%</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[220px] pl-4">
                <SortButton column="name" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  Name
                </SortButton>
              </TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Funnel</TableHead>
              <TableHead className="text-right">
                <SortButton column="liftMean" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Lift</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">CI Lower</TableHead>
              <TableHead className="text-right">CI Upper</TableHead>
              <TableHead className="text-right">
                <SortButton column="confidence" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Conf.</span>
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton column="saturationPct" currentKey={sortKey} currentDir={sortDir} onSort={handleSort}>
                  <span className="ml-auto">Sat %</span>
                </SortButton>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Pts</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j} className={j === 0 ? 'pl-4' : j === 9 ? 'pr-4' : ''}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  Unable to load campaign data. Retry in a moment.
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                  {rows?.length === 0
                    ? `No campaigns found for this ${level} view.`
                    : 'No campaigns match the current filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const isExpanded = expandedRows.has(row.id);
                const isSelected = selectedRowId === row.id;
                const platformLabel = PLATFORM_LABELS[row.platform?.toLowerCase() ?? ''] ?? row.platform;
                const statusInfo = row.status ? (STATUS_CONFIG[row.status] ?? null) : null;

                return (
                  <React.Fragment key={row.id}>
                    <TableRow
                      className={cn(
                        'h-12 cursor-pointer hover:bg-muted/50',
                        isExpanded && 'bg-muted/30',
                        isSelected && 'bg-brand-primary/5 ring-1 ring-inset ring-brand-primary/20',
                      )}
                      onClick={() => {
                        handleRowClick(row);
                        if (level !== 'campaign') toggleExpand(row.id);
                      }}
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

                      {/* Funnel */}
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {row.funnelStage ?? '—'}
                      </TableCell>

                      {/* Lift Mean */}
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

                      {/* CI Lower */}
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {row.liftLower != null ? fmt(row.liftLower, 'lift') : '—'}
                      </TableCell>

                      {/* CI Upper */}
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        {row.liftUpper != null ? fmt(row.liftUpper, 'lift') : '—'}
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

                      {/* Saturation % */}
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.saturationPct != null ? (
                          <span
                            className={cn(
                              row.saturationPct >= 80
                                ? 'text-red-600 dark:text-red-400'
                                : row.saturationPct >= 60
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400',
                            )}
                          >
                            {row.saturationPct.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {statusInfo ? (
                          <Badge variant="outline" className={cn('text-xs', statusInfo.className)}>
                            {statusInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Data Points */}
                      <TableCell className="pr-4 text-right text-xs tabular-nums text-muted-foreground">
                        {row.dataPoints ?? '—'}
                      </TableCell>
                    </TableRow>

                    {/* Expanded sub-rows */}
                    {isExpanded && (
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={10} className="py-2 pl-10 text-xs text-muted-foreground">
                          Campaign-level constituent data will appear here in a future release.
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
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {rows?.length ?? 0} {LEVEL_LABELS[level].toLowerCase()} rows
        </p>
      )}
    </div>
  );
}
