import { Worker } from 'bullmq';
import { redisConnection } from './redis';
import { processSyncJob } from './jobs/sync';
import { processBackfillJob } from './jobs/backfill';
import { processScoringJob, enqueueFullTenantScoring } from '../scoring/worker';
import { scanAllCampaignsForBudgetChanges, enqueueScoringJob } from '../scoring';
import { recomputeRollups } from '../scoring/rollup';
import { checkAndNotifyDataHealth, checkAndNotifyNewRecommendations } from '../notifications';
import type { SyncJobData } from '../types';
import type { ScoringJobData, TenantScoringJobData } from '../scoring/dispatch';

// ---------------------------------------------------------------------------
// Ingestion worker
// ---------------------------------------------------------------------------

/**
 * BullMQ worker process entry point — Ingestion queue.
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
// Scoring worker
// ---------------------------------------------------------------------------

/**
 * BullMQ worker for the 'scoring' queue — separate from ingestion.
 *
 * Python model fitting is CPU-heavy; a dedicated queue prevents scoring
 * from blocking data ingestion (RESEARCH.md recommendation).
 *
 * Job routing by name:
 *   'score-campaign'      → processScoringJob (individual campaign scoring)
 *   'score-all-campaigns' → enqueueFullTenantScoring (batch dispatch)
 *
 * Concurrency: 2 — lower than ingestion's 3 because Python sidecar is
 * CPU-bound. 2 concurrent model fits balance throughput vs resource usage.
 *
 * Budget change detection runs as a pre-scoring step before dispatching
 * individual campaign jobs (STAT-04).
 *
 * After all campaigns score for a tenant, recomputeRollups() is called
 * to produce cluster/channel/overall aggregate scores (STAT-02).
 */
const scoringWorker = new Worker<ScoringJobData | TenantScoringJobData>(
  'scoring',
  async (job) => {
    if (job.name === 'score-campaign') {
      // Individual campaign scoring — calls Python sidecar
      return processScoringJob(job as Parameters<typeof processScoringJob>[0]);

    } else if (job.name === 'score-all-campaigns') {
      const { tenantId } = job.data as TenantScoringJobData;

      // Pre-scoring step: detect budget changes and enqueue targeted re-scoring
      // STAT-04: budget changes trigger pre/post ITS analysis
      try {
        const budgetChanges = await scanAllCampaignsForBudgetChanges(tenantId);
        for (const change of budgetChanges) {
          await enqueueScoringJob(tenantId, change.campaignId, 'budget_change', change.changeDate);
        }
        if (budgetChanges.length > 0) {
          console.info(
            `[scoring-worker] Detected ${budgetChanges.length} budget changes for tenant ${tenantId} — enqueued targeted re-scoring`,
          );
        }
      } catch (err) {
        // Budget change detection failure is non-fatal — log and continue
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[scoring-worker] Budget change detection failed for tenant ${tenantId}: ${message}`,
        );
      }

      // Enqueue individual scoring jobs for all active campaigns
      await enqueueFullTenantScoring(tenantId, 'nightly');

      // Trigger rollup recompute after batch scoring completes
      // Note: rollup is best-effort here — individual job completions also
      // trigger rollups via the 'completed' event handler below.
      try {
        await recomputeRollups(tenantId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[scoring-worker] Rollup recompute failed for tenant ${tenantId}: ${message}`,
        );
      }

      // Post-scoring notification: alert on new scale_up recommendations
      // Runs after rollups so recommendations are based on final aggregated scores.
      try {
        await checkAndNotifyNewRecommendations(tenantId, []);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[scoring-worker] Recommendation notification check failed for tenant ${tenantId}: ${message}`,
        );
      }

    } else {
      console.warn(`[scoring-worker] Unknown job name: ${job.name} — skipping`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 2, // Lower than ingestion — Python is CPU-heavy (RESEARCH.md)
  },
);

// ---------------------------------------------------------------------------
// Worker lifecycle logging — ingestion worker
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

  // Data health check on ingestion failure — notify tenant if integration is stale
  const tenantId = (job?.data as { tenantId?: string } | undefined)?.tenantId;
  if (tenantId) {
    checkAndNotifyDataHealth(tenantId).catch((notifyErr: Error) => {
      console.warn(
        `[worker] Data health notification check failed for tenant ${tenantId}: ${notifyErr.message}`,
      );
    });
  }
});

worker.on('error', (err) => {
  console.error(`[worker] Worker error: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Worker lifecycle logging — scoring worker
// ---------------------------------------------------------------------------

scoringWorker.on('ready', () => {
  console.info('[scoring-worker] Scoring worker ready — listening for jobs');
});

scoringWorker.on('completed', (job) => {
  console.info(`[scoring-worker] Job completed: ${job.name} (id=${job.id})`);
});

scoringWorker.on('failed', (job, err) => {
  const jobId = job?.id ?? 'unknown';
  const jobName = job?.name ?? 'unknown';
  console.error(
    `[scoring-worker] Job failed: ${jobName} (id=${jobId}) — ${err.message}`,
  );
});

scoringWorker.on('error', (err) => {
  console.error(`[scoring-worker] Worker error: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown — both workers
// ---------------------------------------------------------------------------

async function shutdown(): Promise<void> {
  console.info('[worker] Shutdown signal received — closing workers gracefully');
  try {
    // Close both workers; each waits for active jobs to complete before stopping.
    await Promise.all([
      worker.close(),
      scoringWorker.close(),
    ]);
    console.info('[worker] All workers closed cleanly');
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Error during shutdown: ${message}`);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { worker, scoringWorker };
