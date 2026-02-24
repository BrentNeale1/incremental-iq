import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, count } from 'drizzle-orm';
import { db } from '@incremental-iq/db';
import { integrations, syncRuns } from '@incremental-iq/db';
import { enqueueManualSync } from '@incremental-iq/ingestion';
import type { Platform } from '@incremental-iq/ingestion';

/**
 * POST /api/integrations/[id]/sync
 *
 * Manual "Sync now" endpoint. Enqueues a manual sync job in BullMQ and
 * returns 202 Accepted immediately — the sync runs asynchronously.
 *
 * Rate limiting (user decision: prevent API abuse):
 *   - Max 3 manual syncs per integration per day
 *   - If a manual sync was triggered in the last hour, return 429
 *   - Rate limit is checked against sync_runs table (no Redis required)
 *
 * Auth: Phase 2 uses X-Tenant-Id header — auth is Phase 6.
 *
 * Returns:
 *   202: { message: 'Sync queued', jobId: string }
 *   429: { error: 'Rate limit exceeded', retryAfter: number }
 *   404: { error: 'Integration not found' }
 *   400: { error: 'Missing X-Tenant-Id header' }
 */
export async function POST(
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

  // Look up the integration to verify it exists and get platform
  const [integration] = await db
    .select({
      id: integrations.id,
      platform: integrations.platform,
      status: integrations.status,
    })
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

  // Rate limiting: check sync_runs for recent manual syncs
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Count manual syncs in the last 24 hours
  const [dailyCountResult] = await db
    .select({ value: count() })
    .from(syncRuns)
    .where(and(
      eq(syncRuns.integrationId, integrationId),
      eq(syncRuns.runType, 'manual'),
      gte(syncRuns.startedAt, oneDayAgo),
    ));

  const dailyCount = dailyCountResult?.value ?? 0;

  if (dailyCount >= 3) {
    // Rate limit: max 3 manual syncs per day per integration
    const retryAfterSeconds = Math.ceil(
      (new Date(oneDayAgo.getTime() + 24 * 60 * 60 * 1000).getTime() - Date.now()) / 1000,
    );
    return NextResponse.json(
      {
        error: 'Rate limit exceeded — max 3 manual syncs per day per integration',
        retryAfter: retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      },
    );
  }

  // Also check: if a manual sync ran in the last hour, return 429
  const [recentResult] = await db
    .select({ value: count() })
    .from(syncRuns)
    .where(and(
      eq(syncRuns.integrationId, integrationId),
      eq(syncRuns.runType, 'manual'),
      gte(syncRuns.startedAt, oneHourAgo),
    ));

  const recentCount = recentResult?.value ?? 0;

  if (recentCount > 0) {
    const retryAfterSeconds = 3600;
    return NextResponse.json(
      {
        error: 'A manual sync was triggered recently — please wait before syncing again',
        retryAfter: retryAfterSeconds,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      },
    );
  }

  // Enqueue the manual sync job
  const jobId = await enqueueManualSync(
    tenantId,
    integration.platform as Platform,
    integrationId,
  );

  return NextResponse.json(
    { message: 'Sync queued', jobId },
    { status: 202 },
  );
}
