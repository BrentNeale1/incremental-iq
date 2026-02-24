import type { Job } from 'bullmq';
import { eq, and, count, countDistinct } from 'drizzle-orm';
import { eachMonthOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';
import {
  db,
  withTenant,
  syncRuns,
  integrations,
  ingestionCoverage,
  tenants,
} from '@incremental-iq/db';
import { processMetaSync } from '../../normalizers/meta';
import { processGoogleAdsSync } from '../../normalizers/google-ads';
import { processShopifySync } from '../../normalizers/shopify';
import { registerNightlySync } from '../queues';
import type { SyncJobData } from '../../types';

/**
 * BullMQ job handler for historical backfill jobs.
 *
 * Handles job name: 'backfill'.
 *
 * The backfill job pulls historical data month-by-month, reporting live progress
 * so the UI can display "Meta Ads: 14 of 36 months pulled" (user decision).
 *
 * Orchestration:
 *   1. Create syncRuns record with runType 'backfill', status 'running'
 *   2. Determine the full date range from job data (typically 3 years)
 *   3. Split into monthly chunks using date-fns eachMonthOfInterval
 *   4. Process each month sequentially, calling the platform process function
 *   5. After each month: update BullMQ progress AND syncRuns.progressMetadata
 *   6. On month failure: log to progressMetadata, continue to next month
 *      (user decision: keep successfully pulled data, retry rest on next cycle)
 *   7. On full completion: register nightly sync scheduler
 *   8. Check ingestion_coverage for 1-year gate (ARCH-03) — unlock analysis if met
 *
 * Platform-specific lookback limits:
 *   meta:       37 months for aggregate totals (RESEARCH.md Pitfall 2)
 *   google_ads: up to 3 years (no practical limit)
 *   shopify:    all available order history with read_all_orders scope
 *
 * RLS note (RESEARCH.md Pitfall 6): syncRuns inserts use db directly with explicit
 * tenant filters. RLS-protected tables use withTenant().
 */
export async function processBackfillJob(job: Job<SyncJobData>): Promise<void> {
  const { tenantId, platform, integrationId, dateRange } = job.data;

  if (!dateRange) {
    throw new Error(`Backfill job missing dateRange for integration ${integrationId}`);
  }

  // Step 1: Create syncRuns record with runType 'backfill', status 'running'
  const [syncRun] = await db
    .insert(syncRuns)
    .values({
      tenantId,
      integrationId,
      platform,
      runType: 'backfill',
      status: 'running',
      progressMetadata: { completed: 0, total: 0, unit: 'months', failedMonths: [] },
    })
    .returning({ id: syncRuns.id });

  const syncRunId = syncRun.id;

  // Step 2: Determine monthly chunks
  // Apply platform-specific lookback limits
  let effectiveStart = new Date(dateRange.start);
  const effectiveEnd = new Date(dateRange.end);

  if (platform === 'meta') {
    // Meta supports up to 37 months for aggregate totals (RESEARCH.md Pitfall 2)
    const metaMaxLookback = new Date(effectiveEnd);
    metaMaxLookback.setMonth(metaMaxLookback.getMonth() - 37);
    if (effectiveStart < metaMaxLookback) {
      effectiveStart = metaMaxLookback;
    }
  }
  // google_ads: up to 3 years — no further clamp needed, caller already provides 3yr
  // shopify: all available history — no clamp needed

  // Step 3: Split into monthly chunks
  const months = eachMonthOfInterval({ start: effectiveStart, end: effectiveEnd });
  const totalMonths = months.length;

  // Track failed months for progressMetadata
  const failedMonths: string[] = [];
  let totalRecordsIngested = 0;
  let completedMonths = 0;

  // Update syncRun with the actual total
  await db
    .update(syncRuns)
    .set({
      progressMetadata: {
        completed: 0,
        total: totalMonths,
        unit: 'months',
        failedMonths: [],
      },
    })
    .where(eq(syncRuns.id, syncRunId));

  // Step 4: Process each month sequentially
  for (let i = 0; i < months.length; i++) {
    const monthStart = format(startOfMonth(months[i]), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(months[i]), 'yyyy-MM-dd');
    const monthLabel = format(months[i], 'yyyy-MM');

    try {
      let recordsIngested = 0;

      if (platform === 'meta') {
        const result = await processMetaSync({
          tenantId,
          integrationId,
          dateRange: { start: monthStart, end: monthEnd },
        });
        recordsIngested = result.recordsIngested;
      } else if (platform === 'google_ads') {
        const result = await processGoogleAdsSync({
          tenantId,
          integrationId,
          dateRange: { start: monthStart, end: monthEnd },
        });
        recordsIngested = result.recordsIngested;
      } else if (platform === 'shopify') {
        const result = await processShopifySync({
          tenantId,
          integrationId,
          dateRange: { start: monthStart, end: monthEnd },
        });
        recordsIngested = result.recordsIngested;
      } else {
        throw new Error(`Unknown platform: ${platform}`);
      }

      totalRecordsIngested += recordsIngested;
      completedMonths++;

    } catch (err) {
      // Step 6: Month failure — log and continue with next month
      // User decision: keep successfully pulled data, retry rest on next cycle
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[backfill] Failed month ${monthLabel} for ${platform}/${integrationId}: ${message}`,
      );
      failedMonths.push(`${monthLabel}: ${message}`);
    }

    // Step 5: Update progress after each month (successful or failed)
    const progressData = {
      completed: i + 1,
      total: totalMonths,
      unit: 'months',
      failedMonths,
    };

    // Update BullMQ job progress (readable by UI polling the queue)
    await job.updateProgress({ completed: i + 1, total: totalMonths, unit: 'months' });

    // Update syncRuns.progressMetadata in DB for durability
    await db
      .update(syncRuns)
      .set({ progressMetadata: progressData })
      .where(eq(syncRuns.id, syncRunId));
  }

  // Determine final status
  const hasFailed = failedMonths.length > 0;
  const hasSucceeded = completedMonths > 0;
  const finalStatus = !hasSucceeded
    ? 'failed'
    : hasFailed
      ? 'partial'
      : 'success';

  // Update syncRuns with final state
  await db
    .update(syncRuns)
    .set({
      status: finalStatus,
      completedAt: new Date(),
      recordsIngested: String(totalRecordsIngested),
      progressMetadata: {
        completed: months.length,
        total: totalMonths,
        unit: 'months',
        failedMonths,
      },
    })
    .where(eq(syncRuns.id, syncRunId));

  // Update integration lastSyncStatus
  await db
    .update(integrations)
    .set({
      lastSyncedAt: new Date(),
      lastSyncStatus: finalStatus,
      updatedAt: new Date(),
    })
    .where(eq(integrations.id, integrationId));

  // Step 7: Register nightly sync scheduler now that backfill is complete
  // This is idempotent — safe to call even if scheduler was already registered
  await registerNightlySync(tenantId, platform, integrationId);

  // Step 8: Check ARCH-03 gate — if >= 1 year of coverage exists, unlock analysis
  await checkAndUnlockAnalysis(tenantId);
}

// ---------------------------------------------------------------------------
// ARCH-03: Analysis gate check
// ---------------------------------------------------------------------------

/**
 * Checks whether this tenant has >= 1 year of complete coverage data.
 * If so, sets tenants.analysisUnlocked = true (ARCH-03 gate).
 *
 * The analysis gate query counts distinct coverage_date values in the last
 * year across all ingestion sources. If >= 365 distinct dates are covered
 * with status 'complete', the tenant is considered ready for analysis.
 *
 * Uses db directly (no RLS) since tenants table has no RLS policy.
 */
async function checkAndUnlockAnalysis(tenantId: string): Promise<void> {
  try {
    // Count distinct complete coverage dates in the last year
    const [result] = await db.execute<{ coverage_count: string }>(
      /* sql */ `
        SELECT COUNT(DISTINCT coverage_date)::text AS coverage_count
        FROM ingestion_coverage
        WHERE tenant_id = ${tenantId}::uuid
          AND source IN ('shopify', 'google_ads', 'meta')
          AND status = 'complete'
          AND coverage_date >= NOW() - INTERVAL '1 year'
      `,
    );

    const coverageCount = parseInt(result?.coverage_count ?? '0', 10);

    if (coverageCount >= 365) {
      await db
        .update(tenants)
        .set({
          analysisUnlocked: true,
          analysisUnlockedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, tenantId));

      console.info(
        `[backfill] ARCH-03: Analysis unlocked for tenant ${tenantId} (${coverageCount} coverage days found)`,
      );
    }
  } catch (err) {
    // Non-fatal — log but don't fail the backfill job over a gate check
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[backfill] ARCH-03 gate check failed for tenant ${tenantId}: ${message}`);
  }
}
