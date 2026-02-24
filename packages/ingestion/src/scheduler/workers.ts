import { Worker } from 'bullmq';
import { redisConnection } from './queues';
import { processSyncJob } from './jobs/sync';
import { processBackfillJob } from './jobs/backfill';
import type { SyncJobData } from '../types';

/**
 * BullMQ worker process entry point.
 *
 * Meant to be run as a separate long-lived Node.js process alongside the
 * Next.js web application. It connects to the same Redis instance and
 * processes ingestion jobs from the 'ingestion' queue.
 *
 * Job routing by name:
 *   'incremental-sync' → processSyncJob   (nightly scheduled sync)
 *   'manual-sync'      → processSyncJob   (user-initiated "Sync now")
 *   'backfill'         → processBackfillJob (historical data pull)
 *
 * Concurrency: 3 allows parallel sync of different tenants/platforms without
 * overwhelming the DB connection pool or Redis. Each platform syncs
 * independently — one failure does not block others (user decision).
 *
 * Graceful shutdown on SIGTERM/SIGINT ensures in-flight jobs complete
 * before the process exits (no data loss or orphaned running syncRuns).
 */
const worker = new Worker<SyncJobData>(
  'ingestion',
  async (job) => {
    if (job.name === 'incremental-sync' || job.name === 'manual-sync') {
      return processSyncJob(job);
    } else if (job.name === 'backfill') {
      return processBackfillJob(job);
    } else {
      console.warn(`[worker] Unknown job name: ${job.name} — skipping`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 3,
  },
);

// ---------------------------------------------------------------------------
// Worker lifecycle logging
// ---------------------------------------------------------------------------

worker.on('ready', () => {
  console.info('[worker] Ingestion worker ready — listening for jobs');
});

worker.on('completed', (job) => {
  console.info(`[worker] Job completed: ${job.name} (id=${job.id})`);
});

worker.on('failed', (job, err) => {
  const jobId = job?.id ?? 'unknown';
  const jobName = job?.name ?? 'unknown';
  console.error(`[worker] Job failed: ${jobName} (id=${jobId}) — ${err.message}`);
});

worker.on('error', (err) => {
  console.error(`[worker] Worker error: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.info('[worker] Shutdown signal received — closing worker gracefully');
  try {
    // close() waits for active jobs to complete before terminating
    await worker.close();
    console.info('[worker] Worker closed cleanly');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Error during shutdown: ${message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { worker };
