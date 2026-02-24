'use client';

import * as React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useFreshness } from '@/lib/hooks/useFreshness';
import { Button } from '@/components/ui/button';

export interface StaleDataBannerProps {
  tenantId?: string;
}

/**
 * StaleDataBanner — inline warning banner shown at the top of any page
 * when one or more integrations have not synced in >24 hours.
 *
 * Per design spec: "Stale data: Inline warning banners showing last-known-good
 * data with fix-it link. Never hide the dashboard."
 *
 * - Shows amber warning banner with "{Platform} data is N days stale"
 * - Provides "Reconnect" link to the OAuth endpoint
 * - Dismissable per session (local React state — reappears on page reload)
 *
 * If all integrations are fresh, renders nothing.
 */
export function StaleDataBanner({ tenantId }: StaleDataBannerProps) {
  const { data: freshnessData } = useFreshness(tenantId);
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed) return null;

  const staleIntegrations = (freshnessData?.integrations ?? []).filter(
    (integration) =>
      integration.status === 'active' &&
      // Freshness string contains "days ago" when stale >24h
      (integration.freshness.includes('days') ||
        integration.freshness.includes('weeks') ||
        integration.freshness.includes('month')),
  );

  if (staleIntegrations.length === 0) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-400"
      role="alert"
      aria-label="Stale data warning"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />

      <div className="flex-1 text-sm">
        {staleIntegrations.length === 1 ? (
          <>
            <span className="font-medium capitalize">
              {staleIntegrations[0]!.platform}
            </span>{' '}
            data is{' '}
            <span>{staleIntegrations[0]!.freshness}</span>
            {' — '}
            <a
              href={`/api/oauth/${staleIntegrations[0]!.platform}`}
              className="font-medium underline underline-offset-4 hover:text-amber-900 dark:hover:text-amber-300 transition-colors duration-[400ms]"
            >
              Reconnect
            </a>{' '}
            to resume syncing.
          </>
        ) : (
          <>
            <span className="font-medium">
              {staleIntegrations.length} integrations
            </span>{' '}
            have stale data:{' '}
            {staleIntegrations.map((integration, i) => (
              <span key={integration.id}>
                <span className="font-medium capitalize">{integration.platform}</span>
                {' ('}
                <a
                  href={`/api/oauth/${integration.platform}`}
                  className="underline underline-offset-4 hover:text-amber-900 dark:hover:text-amber-300 transition-colors duration-[400ms]"
                >
                  reconnect
                </a>
                {')'}
                {i < staleIntegrations.length - 1 ? ', ' : ''}
              </span>
            ))}
          </>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/30"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss stale data warning"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
