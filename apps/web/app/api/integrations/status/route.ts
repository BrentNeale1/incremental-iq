import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { eq, inArray, and } from 'drizzle-orm';
import { formatDistanceToNow } from 'date-fns';
import { db } from '@incremental-iq/db';
import { integrations, syncRuns } from '@incremental-iq/db';

/**
 * GET /api/integrations/status
 *
 * Global freshness summary across all integrations for a tenant.
 * Used by the main dashboard to show the integration health indicator
 * (user decision: visible from main dashboard).
 *
 * tenantId is extracted from the authenticated session — not from a header.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Global health levels:
 *   healthy — all integrations connected and synced within 24h
 *   warning — any integration synced > 24h ago, or any partial failure
 *   error   — any integration has expired token or failed sync
 *
 * Response includes warnings array for any integrations needing attention
 * (triggers the in-app warning banner — user decision).
 *
 * Returns:
 *   200: GlobalFreshnessStatus JSON
 *   401: { error: 'Unauthorized' }
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  // Query all integrations for this tenant
  const allIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));

  if (allIntegrations.length === 0) {
    return NextResponse.json({
      globalStatus: 'healthy',
      integrations: [],
      warnings: [],
    });
  }

  // Check which integrations have a sync currently in progress
  const integrationIds = allIntegrations.map((i) => i.id);
  const runningIntegrationIds = new Set<string>();
  if (integrationIds.length > 0) {
    const runningSyncs = await db
      .select({ integrationId: syncRuns.integrationId })
      .from(syncRuns)
      .where(
        and(
          inArray(syncRuns.integrationId, integrationIds),
          eq(syncRuns.status, 'running'),
        ),
      );
    for (const r of runningSyncs) {
      runningIntegrationIds.add(r.integrationId);
    }
  }

  // Build integration status array and collect warnings
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const warnings: string[] = [];

  const integrationStatuses = allIntegrations.map((integration) => {
    const freshness = integration.lastSyncedAt
      ? formatDistanceToNow(new Date(integration.lastSyncedAt), { addSuffix: true })
      : 'never';

    const syncInProgress = runningIntegrationIds.has(integration.id);

    // Collect warnings for this integration
    if (integration.status === 'expired') {
      const name = integration.accountName ?? integration.accountId ?? integration.platform;
      warnings.push(`${name} token expired — reconnect required`);
    } else if (integration.status === 'error') {
      const name = integration.accountName ?? integration.accountId ?? integration.platform;
      warnings.push(`${name} sync failing — check integration settings`);
    } else if (integration.lastSyncStatus === 'failed') {
      const name = integration.accountName ?? integration.accountId ?? integration.platform;
      warnings.push(`${name} last sync failed`);
    } else if (
      integration.lastSyncedAt &&
      now - new Date(integration.lastSyncedAt).getTime() > oneDayMs
    ) {
      const name = integration.accountName ?? integration.accountId ?? integration.platform;
      warnings.push(`${name} has not synced in over 24 hours`);
    }

    return {
      id: integration.id,
      platform: integration.platform,
      status: integration.status,
      accountName: integration.accountName,
      freshness,
      lastSyncStatus: integration.lastSyncStatus,
      syncInProgress,
    };
  });

  // Determine global health status
  const hasError = allIntegrations.some(
    (i) =>
      i.status === 'expired' ||
      i.status === 'error' ||
      i.lastSyncStatus === 'failed',
  );

  const hasWarning = allIntegrations.some(
    (i) =>
      i.lastSyncStatus === 'partial' ||
      (i.lastSyncedAt &&
        now - new Date(i.lastSyncedAt).getTime() > oneDayMs),
  );

  let globalStatus: 'healthy' | 'warning' | 'error';
  if (hasError) {
    globalStatus = 'error';
  } else if (hasWarning || warnings.length > 0) {
    globalStatus = 'warning';
  } else {
    globalStatus = 'healthy';
  }

  return NextResponse.json({
    globalStatus,
    integrations: integrationStatuses,
    warnings,
  });
}
