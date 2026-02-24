import { NextRequest, NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { formatDistanceToNow } from 'date-fns';
import { db } from '@incremental-iq/db';
import { integrations, syncRuns } from '@incremental-iq/db';

/**
 * GET /api/integrations/[id]/status
 *
 * Returns per-integration status and sync history.
 *
 * Response includes:
 *   - Integration status, lastSyncedAt, lastSyncStatus
 *   - Human-readable freshness string ("2h ago", "1d ago")
 *   - syncInProgress flag and current progress metadata if a job is running
 *   - Last 7 sync run records (user decision: 5-7 history entries)
 *
 * Auth: Phase 2 uses X-Tenant-Id header — auth is Phase 6.
 *
 * Returns:
 *   200: IntegrationStatus JSON
 *   404: { error: 'Integration not found' }
 *   400: { error: 'Missing X-Tenant-Id header' }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: integrationId } = await params;
  const tenantId = request.headers.get('x-tenant-id');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing X-Tenant-Id header' },
      { status: 400 },
    );
  }

  // Query integration record
  const [integration] = await db
    .select()
    .from(integrations)
    .where(and(
      eq(integrations.id, integrationId),
      eq(integrations.tenantId, tenantId),
    ))
    .limit(1);

  if (!integration) {
    return NextResponse.json(
      { error: 'Integration not found' },
      { status: 404 },
    );
  }

  // Query last 7 sync runs
  const syncHistory = await db
    .select({
      id: syncRuns.id,
      runType: syncRuns.runType,
      status: syncRuns.status,
      startedAt: syncRuns.startedAt,
      completedAt: syncRuns.completedAt,
      recordsIngested: syncRuns.recordsIngested,
      errorMessage: syncRuns.errorMessage,
      progressMetadata: syncRuns.progressMetadata,
    })
    .from(syncRuns)
    .where(eq(syncRuns.integrationId, integrationId))
    .orderBy(desc(syncRuns.startedAt))
    .limit(7);

  // Calculate freshness
  const freshness = integration.lastSyncedAt
    ? formatDistanceToNow(new Date(integration.lastSyncedAt), { addSuffix: true })
    : 'never';

  // Determine if a sync is currently in progress
  const runningSync = syncHistory.find((run) => run.status === 'running');
  const syncInProgress = !!runningSync;
  const currentProgress = runningSync?.progressMetadata ?? null;

  return NextResponse.json({
    id: integration.id,
    platform: integration.platform,
    status: integration.status,
    accountId: integration.accountId,
    accountName: integration.accountName,
    lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
    lastSyncStatus: integration.lastSyncStatus,
    freshness,
    syncInProgress,
    currentProgress,
    syncHistory: syncHistory.map((run) => ({
      id: run.id,
      runType: run.runType,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      recordsIngested: run.recordsIngested ? parseInt(run.recordsIngested, 10) : null,
      errorMessage: run.errorMessage ?? null,
      progressMetadata: run.progressMetadata ?? null,
    })),
  });
}
