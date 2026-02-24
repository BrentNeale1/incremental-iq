'use client';

import * as React from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CircleIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { IntegrationSyncHistory } from '@/lib/hooks/useSyncHistory';

interface SyncStatusListProps {
  integrations: IntegrationSyncHistory[];
  isLoading: boolean;
  onManualSync?: (integrationId: string) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  google_ads: 'Google Ads',
  shopify: 'Shopify',
};

const PLATFORM_COLORS: Record<string, string> = {
  meta: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  google: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  google_ads: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  shopify: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
};

const OAUTH_PATHS: Record<string, string> = {
  meta: '/api/oauth/meta',
  google: '/api/oauth/google',
  google_ads: '/api/oauth/google',
  shopify: '/api/oauth/shopify',
};

interface StatusConfig {
  label: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
  dotClass: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  active: {
    label: 'Connected',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    icon: CheckCircleIcon,
    dotClass: 'bg-emerald-500',
  },
  expired: {
    label: 'Stale',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    icon: AlertTriangleIcon,
    dotClass: 'bg-amber-500',
  },
  error: {
    label: 'Error',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    icon: AlertCircleIcon,
    dotClass: 'bg-red-500',
  },
  disconnected: {
    label: 'Disconnected',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    icon: CircleIcon,
    dotClass: 'bg-slate-400',
  },
};

function RunDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    success: 'bg-emerald-500',
    partial: 'bg-amber-400',
    failed: 'bg-red-500',
    running: 'bg-blue-400',
  };
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full', colorMap[status] ?? 'bg-slate-400')}
      title={status}
    />
  );
}

/**
 * SyncStatusList — per-integration sync status with freshness indicators.
 *
 * For each integration shows:
 *   - Platform icon (badge) + account name
 *   - Last successful sync relative timestamp
 *   - Status badge: Connected (green), Stale (yellow), Error (red), Disconnected (gray)
 *   - Mini run-status timeline (last 5 sync dots)
 *
 * Stale integrations (>24h) show an inline warning banner with a reconnect link.
 * Per design spec: "Never hide the dashboard" — show last-known-good data with warning.
 */
export function SyncStatusList({ integrations, isLoading, onManualSync }: SyncStatusListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-60" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No integrations connected yet — use the OAuth links to connect your first platform.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {integrations.map((item) => {
        const { integration, recentRuns, isStale, staleSinceHours } = item;
        const statusCfg = STATUS_CONFIG[integration.status] ?? STATUS_CONFIG.disconnected;
        const StatusIcon = statusCfg.icon;
        const platformLabel =
          PLATFORM_LABELS[integration.platform?.toLowerCase() ?? ''] ?? integration.platform;
        const oauthPath = OAUTH_PATHS[integration.platform?.toLowerCase() ?? ''] ?? '#';
        const platformColor = PLATFORM_COLORS[integration.platform?.toLowerCase() ?? ''] ?? '';

        return (
          <div key={integration.id} className="overflow-hidden rounded-lg border bg-card">
            {/* Stale warning banner */}
            {isStale && (
              <div className="flex items-center justify-between border-b bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                <span>
                  <AlertTriangleIcon className="mr-1.5 inline-block h-3.5 w-3.5" />
                  {platformLabel} data is{' '}
                  {staleSinceHours != null
                    ? staleSinceHours >= 24
                      ? `${Math.floor(staleSinceHours / 24)} day${Math.floor(staleSinceHours / 24) !== 1 ? 's' : ''}`
                      : `${staleSinceHours} hour${staleSinceHours !== 1 ? 's' : ''}`
                    : ''}{' '}
                  stale
                </span>
                <a
                  href={oauthPath}
                  className="ml-2 font-medium underline hover:no-underline"
                >
                  Reconnect
                </a>
              </div>
            )}

            {/* Main status row */}
            <div className="flex flex-wrap items-center gap-4 p-4">
              {/* Status dot */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-card">
                <span className={cn('h-3 w-3 rounded-full', statusCfg.dotClass)} />
              </div>

              {/* Platform + account info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge className={cn('text-xs', platformColor)}>{platformLabel}</Badge>
                  {integration.accountName && (
                    <span className="truncate text-sm font-medium">{integration.accountName}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last sync:{' '}
                  {integration.freshness
                    ? integration.freshness
                    : 'Never synced'}
                  {integration.syncInProgress && (
                    <span className="ml-2 inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                      <RefreshCwIcon className="h-3 w-3 animate-spin" />
                      Syncing...
                    </span>
                  )}
                </p>
              </div>

              {/* Run history mini-dots */}
              {recentRuns.length > 0 && (
                <div className="flex items-center gap-1" title="Recent sync runs (newest last)">
                  {recentRuns.slice(-5).map((run, i) => (
                    <RunDot key={run.id ?? i} status={run.status} />
                  ))}
                </div>
              )}

              {/* Status badge */}
              <Badge variant="outline" className={cn('shrink-0 text-xs', statusCfg.badgeClass)}>
                <StatusIcon className="mr-1 h-3 w-3" />
                {statusCfg.label}
              </Badge>

              {/* Manual sync button */}
              {onManualSync && integration.status !== 'disconnected' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => onManualSync(integration.id)}
                  disabled={integration.syncInProgress}
                >
                  {integration.syncInProgress ? (
                    <RefreshCwIcon className="h-3 w-3 animate-spin" />
                  ) : (
                    'Sync now'
                  )}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
