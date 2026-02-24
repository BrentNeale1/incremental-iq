import { Queue } from 'bullmq';
import type { Platform, SyncType } from '../types';
import { redisConnection } from './redis';

// ---------------------------------------------------------------------------
// Redis connection — re-export for external consumers
// ---------------------------------------------------------------------------

export { redisConnection } from './redis';

// ---------------------------------------------------------------------------
// Queue definition
// ---------------------------------------------------------------------------

/**
 * Single BullMQ queue for all ingestion jobs (sync + backfill + manual).
 *
 * A single queue simplifies monitoring and keeps all ingestion work in one place.
 * The worker handles job routing based on job.name:
 *   'incremental-sync' → processSyncJob
 *   'manual-sync'      → processSyncJob
 *   'backfill'         → processBackfillJob
 *
 * upsertJobScheduler is used for repeating nightly syncs — it is idempotent,
 * so calling it on every deploy or integration connect is safe.
 */
export const ingestionQueue = new Queue('ingestion', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
});

// ---------------------------------------------------------------------------
// Job data shapes
// ---------------------------------------------------------------------------

export interface SchedulerJobData {
  tenantId: string;
  platform: Platform;
  integrationId: string;
  type: SyncType;
  dateRange?: {
    start: string; // 'YYYY-MM-DD'
    end: string;   // 'YYYY-MM-DD'
  };
}

// ---------------------------------------------------------------------------
// Nightly scheduler registration
// ---------------------------------------------------------------------------

/**
 * Registers (or updates) the nightly 2am UTC scheduler for a specific
 * tenant + platform + integration combination.
 *
 * Uses upsertJobScheduler which is idempotent — safe to call on every
 * deploy, integration connect, or worker restart. Duplicate calls will
 * update the existing schedule without creating duplicates.
 *
 * The scheduler ID format ensures one nightly schedule per integration:
 *   nightly-{platform}-{tenantId}-{integrationId}
 *
 * Cron pattern: '0 2 * * *' — runs daily at 2:00 AM UTC.
 */
export async function registerNightlySync(
  tenantId: string,
  platform: Platform,
  integrationId: string,
): Promise<void> {
  await ingestionQueue.upsertJobScheduler(
    `nightly-${platform}-${tenantId}-${integrationId}`,
    { pattern: '0 2 * * *' },
    {
      name: 'incremental-sync',
      data: {
        tenantId,
        platform,
        integrationId,
        type: 'incremental',
      } satisfies SchedulerJobData,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    },
  );
}

// ---------------------------------------------------------------------------
// One-time job enqueueing
// ---------------------------------------------------------------------------

/**
 * Enqueues a historical backfill job for a specific integration.
 *
 * The backfill job pulls data month-by-month from dateRange.start to
 * dateRange.end. Typically called once on first integration connect with
 * a 3-year lookback window.
 *
 * The job name 'backfill' routes to processBackfillJob in the worker.
 */
export async function enqueueBackfill(
  tenantId: string,
  platform: Platform,
  integrationId: string,
  dateRange: { start: string; end: string },
): Promise<string> {
  const job = await ingestionQueue.add(
    'backfill',
    {
      tenantId,
      platform,
      integrationId,
      type: 'backfill',
      dateRange,
    } satisfies SchedulerJobData,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 50 },
    },
  );
  return job.id ?? '';
}

/**
 * Enqueues a manual "Sync now" job for a specific integration.
 *
 * Manual syncs run immediately in the worker. They are rate-limited at the
 * API layer (see apps/web/app/api/integrations/[id]/sync/route.ts).
 *
 * The job name 'manual-sync' routes to processSyncJob in the worker.
 *
 * @returns The BullMQ job ID for tracking
 */
export async function enqueueManualSync(
  tenantId: string,
  platform: Platform,
  integrationId: string,
): Promise<string> {
  const job = await ingestionQueue.add(
    'manual-sync',
    {
      tenantId,
      platform,
      integrationId,
      type: 'manual',
    } satisfies SchedulerJobData,
    {
      attempts: 2,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    },
  );
  return job.id ?? '';
}

// ---------------------------------------------------------------------------
// Scoring queue helpers
// ---------------------------------------------------------------------------

/**
 * Re-export of scoringQueue from scoring/dispatch for convenience.
 * The scoring queue is created in dispatch.ts; re-exported here for access
 * alongside the ingestion queue.
 */
export { scoringQueue } from '../scoring/dispatch';

/**
 * Enqueue a full tenant scoring job after a nightly sync completes.
 *
 * Enqueues a single 'score-all-campaigns' job which triggers enqueueFullTenantScoring
 * internally (scoring all active campaigns for the tenant). This decouples the
 * ingestion completion event from the individual campaign scoring jobs.
 *
 * Called at the end of processSyncJob when tenants.analysisUnlocked is true.
 * ARCH-03 gate enforced in sync.ts: only called when analysisUnlocked = true.
 *
 * @param tenantId - Tenant UUID to score all campaigns for.
 */
export async function enqueueScoringAfterSync(tenantId: string): Promise<void> {
  const { scoringQueue: queue } = await import('../scoring/dispatch');
  await queue.add(
    'score-all-campaigns',
    { tenantId, triggerType: 'nightly' },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 20 },
    },
  );
}

/**
 * Register the weekly model refit schedule for a tenant.
 *
 * Wraps dispatch.registerWeeklyRefit — idempotent, safe to call on every
 * OAuth callback or tenant setup. Registers a cron job that re-fits all
 * statistical models on Sundays at 4am UTC (STAT-07).
 *
 * @param tenantId - Tenant UUID to register the refit schedule for.
 */
export async function registerWeeklyRefitSchedule(tenantId: string): Promise<void> {
  const { registerWeeklyRefit } = await import('../scoring/dispatch');
  await registerWeeklyRefit(tenantId);
}
