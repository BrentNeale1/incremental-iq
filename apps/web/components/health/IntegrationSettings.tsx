'use client';

import * as React from 'react';
import { RefreshCwIcon, LinkIcon, UnlinkIcon, SettingsIcon, ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { IntegrationSyncHistory } from '@/lib/hooks/useSyncHistory';

interface IntegrationSettingsProps {
  integrations: IntegrationSyncHistory[];
  isLoading: boolean;
  onManualSync?: (integrationId: string) => Promise<void>;
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  google_ads: 'Google Ads',
  shopify: 'Shopify',
};

const OAUTH_PATHS: Record<string, string> = {
  meta: '/api/oauth/meta',
  google: '/api/oauth/google',
  google_ads: '/api/oauth/google',
  shopify: '/api/oauth/shopify',
};

const SYNC_SCHEDULES: Record<string, string> = {
  meta: 'Daily at 2:00 AM UTC',
  google: 'Daily at 2:00 AM UTC',
  google_ads: 'Daily at 2:00 AM UTC',
  shopify: 'Daily at 2:00 AM UTC',
};

const LOOKBACK_DAYS: Record<string, string> = {
  meta: '90 days',
  google: '90 days',
  google_ads: '90 days',
  shopify: '365 days',
};

/**
 * IntegrationSettings — per-integration management card.
 *
 * For each integration:
 *   - Reconnect button: links to OAuth re-authorization flow
 *   - Sync frequency display (from BullMQ scheduler config)
 *   - Manual sync trigger button: POST to /api/integrations/{id}/sync
 *   - Disconnect button (placeholder — Phase 6 auth)
 *   - Advanced settings section (collapsible): historical range, retention policy
 *
 * Per design spec: "Advanced integration settings" and
 * "Direct links to reconnect/fix broken integrations."
 */
export function IntegrationSettings({
  integrations,
  isLoading,
  onManualSync,
}: IntegrationSettingsProps) {
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());
  const [expandedAdvanced, setExpandedAdvanced] = React.useState<Set<string>>(new Set());

  async function handleManualSync(integrationId: string) {
    setSyncingIds((prev) => new Set(prev).add(integrationId));
    try {
      await onManualSync?.(integrationId);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(integrationId);
        return next;
      });
    }
  }

  function toggleAdvanced(id: string) {
    setExpandedAdvanced((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
        No integrations to configure. Connect a platform first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {integrations.map((item) => {
        const { integration } = item;
        const platformKey = integration.platform?.toLowerCase() ?? '';
        const platformLabel = PLATFORM_LABELS[platformKey] ?? integration.platform;
        const oauthPath = OAUTH_PATHS[platformKey] ?? '#';
        const syncSchedule = SYNC_SCHEDULES[platformKey] ?? 'Daily at 2:00 AM UTC';
        const lookback = LOOKBACK_DAYS[platformKey] ?? '90 days';
        const isSyncing =
          syncingIds.has(integration.id) || integration.syncInProgress;
        const isAdvancedOpen = expandedAdvanced.has(integration.id);

        return (
          <div key={integration.id} className="rounded-lg border bg-card">
            {/* Card header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <SettingsIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{platformLabel}</span>
                {integration.accountName && (
                  <span className="text-sm text-muted-foreground">
                    — {integration.accountName}
                  </span>
                )}
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-xs',
                  integration.status === 'active'
                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                    : integration.status === 'expired'
                      ? 'border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400'
                      : 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400',
                )}
              >
                {integration.status === 'active'
                  ? 'Connected'
                  : integration.status === 'expired'
                    ? 'Stale'
                    : integration.status === 'error'
                      ? 'Error'
                      : 'Disconnected'}
              </Badge>
            </div>

            {/* Settings body */}
            <div className="space-y-4 p-4">
              {/* Sync schedule info */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sync schedule</span>
                <span className="font-medium">{syncSchedule}</span>
              </div>

              <Separator />

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Reconnect */}
                <Button asChild variant="outline" size="sm" className="flex items-center gap-1.5">
                  <a href={oauthPath}>
                    <LinkIcon className="h-3.5 w-3.5" />
                    {integration.status === 'active' ? 'Re-authorize' : 'Reconnect'}
                  </a>
                </Button>

                {/* Manual sync */}
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => handleManualSync(integration.id)}
                  disabled={isSyncing || integration.status === 'disconnected'}
                >
                  <RefreshCwIcon
                    className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
                  />
                  {isSyncing ? 'Syncing...' : 'Sync now'}
                </Button>

                {/* Disconnect (placeholder — Phase 6) */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                  disabled
                  title="Disconnect will be available in Phase 6 (auth)"
                >
                  <UnlinkIcon className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>

              {/* Advanced settings — collapsible */}
              <Collapsible open={isAdvancedOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => toggleAdvanced(integration.id)}
                  >
                    <span>Advanced settings</span>
                    <ChevronDownIcon
                      className={cn('h-3 w-3 transition-transform', isAdvancedOpen && 'rotate-180')}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Historical data range</span>
                      <span className="font-medium">{lookback}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Data retention</span>
                      <span className="font-medium">Indefinite (managed by PostgreSQL)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Rate limit</span>
                      <span className="font-medium">3 manual syncs / day + 1h cooldown</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Integration ID</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {integration.id}
                      </span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        );
      })}
    </div>
  );
}
