import { Queue } from 'bullmq';
import type { Platform, SyncType } from '../types';

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

/**
 * Redis connection config for BullMQ.
 *
 * Reads from environment variables. The connection object is shared across
 * all queues and workers within this process.
 *
 * Required env vars:
 *   REDIS_HOST     — Redis server hostname (default: localhost)
 *   REDIS_PORT     — Redis server port (default: 6379)
 *   REDIS_PASSWORD — Redis AUTH password (optional)
 */
export const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD ?? undefined,
};

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
