import type { Job } from 'bullmq';
import { eq, and, desc } from 'drizzle-orm';
import { subDays, format } from 'date-fns';
import {
  db,
  withTenant,
  integrations,
  syncRuns,
} from '@incremental-iq/db';
import { decryptToken } from '../../crypto';
import { processMetaSync } from '../../normalizers/meta';
import { processGoogleAdsSync } from '../../normalizers/google-ads';
import { processShopifySync } from '../../normalizers/shopify';
import { enqueueBackfill, registerNightlySync } from '../queues';
import type { SyncJobData } from '../../types';

/**
 * BullMQ job handler for incremental and manual sync runs.
 *
 * Handles job names: 'incremental-sync' and 'manual-sync'.
 *
 * Orchestration:
 *   1. Create a syncRuns record with status 'running'
 *   2. Look up integration and decrypt credentials
 *   3. Calculate incremental date range (yesterday since last sync)
 *      - If lastSyncedAt is null: this is a first sync, enqueue backfill instead
 *   4. Call the platform-specific process function
 *   5. Update syncRuns and integration status on completion
 *
 * Failure modes (user decision: platforms are independent):
 *   - Partial failure: some data pulled, status = 'partial', keeps all data
 *   - Full failure:    no data pulled, status = 'failed', logs error
 *   - Token expired:   sets integration.status = 'expired', fails run
 *
 * RLS note (RESEARCH.md Pitfall 6): use db directly for syncRuns inserts with
 * explicit WHERE clauses, or withTenant() for RLS-protected operations.
 */
export async function processSyncJob(job: Job<SyncJobData>): Promise<void> {
  const { tenantId, platform, integrationId } = job.data;

  // Step 1: Create syncRuns record with status 'running'
  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      tenantId,
      integrationId,
      platform,
      runType: job.name === 'manual-sync' ? 'manual' : 'incremental',
      status: 'running',
    })
    .returning({ id: syncRuns.id });

  const syncRunId = syncRun.id;

  try {
    // Step 2: Look up integration from DB
    const [integration] = await db
      .select()
      .from(integrations)
      .where(and(
        eq(integrations.id, integrationId),
        eq(integrations.tenantId, tenantId),
      ))
      .limit(1);

    if (!integration) {
      throw new Error(`Integration not found: ${integrationId} for tenant ${tenantId}`);
    }

    if (!integration.encryptedAccessToken) {
      throw new Error(`No access token found for integration ${integrationId}`);
    }

    // Step 3: Calculate incremental date range
    // If lastSyncedAt is null, this is effectively the first sync — enqueue backfill
    if (!integration.lastSyncedAt) {
      // First sync: enqueue historical backfill and bail out of incremental
      const threeYearsAgo = format(subDays(new Date(), 365 * 3), 'yyyy-MM-dd');
      const today = format(new Date(), 'yyyy-MM-dd');

      await enqueueBackfill(tenantId, platform, integrationId, {
        start: threeYearsAgo,
        end: today,
      });

      // Mark this sync run as success (the decision to backfill is correct)
      await db
        .update(syncRuns)
        .set({
          status: 'success',
          completedAt: new Date(),
          errorMessage: 'No previous sync found — backfill enqueued',
        })
        .where(eq(syncRuns.id, syncRunId));

      return;
    }

    // Incremental range: from the day after lastSyncedAt up to yesterday
    // We don't sync today since it's incomplete data
    const startDate = format(
      subDays(new Date(integration.lastSyncedAt), -1), // day after last sync
      'yyyy-MM-dd',
    );
    const endDate = format(subDays(new Date(), 1), 'yyyy-MM-dd'); // yesterday

    const dateRange = { start: startDate, end: endDate };

    // Step 4: Call the platform-specific process function
    let recordsIngested = 0;

    if (platform === 'meta') {
      const result = await processMetaSync({ tenantId, integrationId, dateRange });
      recordsIngested = result.recordsIngested;
    } else if (platform === 'google_ads') {
      const result = await processGoogleAdsSync({ tenantId, integrationId, dateRange });
      recordsIngested = result.recordsIngested;
    } else if (platform === 'shopify') {
      const result = await processShopifySync({ tenantId, integrationId, dateRange });
      recordsIngested = result.recordsIngested;
    } else {
      throw new Error(`Unknown platform: ${platform}`);
    }

    // Step 5a: Success — update syncRuns and integration
    await db
      .update(syncRuns)
      .set({
        status: 'success',
        completedAt: new Date(),
        recordsIngested: String(recordsIngested),
      })
      .where(eq(syncRuns.id, syncRunId));

    await db
      .update(integrations)
      .set({
        lastSyncedAt: new Date(),
        lastSyncStatus: 'success',
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId));

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTokenExpired =
      message.includes('token expired') ||
      message.includes('Token expired') ||
      message.includes('OAuthException') ||
      message.includes('401') ||
      message.includes('invalid_token');

    // Step 5b: Failure — classify as partial or full failure
    // A partial failure has data already written; full failure had no records
    // For simplicity, we treat any thrown error as a full failure unless it
    // carries a 'partial' marker (processXSync throws with partial marker).
    const isPartial = message.includes('[partial]');

    const finalStatus = isPartial ? 'partial' : 'failed';

    await db
      .update(syncRuns)
      .set({
        status: finalStatus,
        completedAt: new Date(),
        errorMessage: message.replace('[partial] ', ''),
      })
      .where(eq(syncRuns.id, syncRunId));

    await db
      .update(integrations)
      .set({
        // If token expired, mark integration as expired to trigger re-auth warning
        status: isTokenExpired ? 'expired' : 'error',
        lastSyncStatus: finalStatus,
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, integrationId));

    // Re-throw so BullMQ can handle retries
    throw err;
  }
}
