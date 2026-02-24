/**
 * Scoring job dispatch — enqueue scoring jobs to the BullMQ 'scoring' queue.
 *
 * The scoring queue is separate from the ingestion queue because Python model
 * fitting is CPU-heavy and should not block data ingestion jobs. A dedicated
 * queue allows independent concurrency tuning and monitoring.
 *
 * STAT-07: Weekly refit schedule registered via upsertJobScheduler.
 * STAT-04: Budget change trigger via enqueueScoringJob with triggerType='budget_change'.
 */

import { Queue } from 'bullmq';
import { redisConnection } from '../scheduler/redis';
import { db, withTenant } from '@incremental-iq/db';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Scoring queue
// ---------------------------------------------------------------------------

/**
 * Dedicated BullMQ queue for scoring jobs.
 *
 * Separate from the ingestion queue so CPU-heavy Python model fitting
 * does not block data ingestion (RESEARCH.md recommendation).
 */
export const scoringQueue = new Queue('scoring', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 50 },
  },
});

// ---------------------------------------------------------------------------
// Job data shapes
// ---------------------------------------------------------------------------

/** Data payload for a single campaign scoring job. */
export interface ScoringJobData {
  tenantId: string;
  campaignId: string;
  triggerType: 'nightly' | 'budget_change' | 'manual';
}

/** Data payload for a full tenant scoring job (enqueues individual campaign jobs). */
export interface TenantScoringJobData {
  tenantId: string;
  triggerType: 'nightly' | 'manual';
}

// ---------------------------------------------------------------------------
// Job dispatch functions
// ---------------------------------------------------------------------------

/**
 * Enqueue a scoring job for a single campaign.
 *
 * Adds a 'score-campaign' job with 3 retry attempts and exponential backoff
 * starting at 30 seconds (Python model fitting may take time to warm up).
 *
 * @param tenantId    - Tenant UUID for RLS context and isolation.
 * @param campaignId  - Campaign UUID to score.
 * @param triggerType - What triggered this scoring run (for audit/logging).
 */
export async function enqueueScoringJob(
  tenantId: string,
  campaignId: string,
  triggerType: 'nightly' | 'budget_change' | 'manual',
): Promise<void> {
  await scoringQueue.add(
    'score-campaign',
    { tenantId, campaignId, triggerType } satisfies ScoringJobData,
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 50 },
    },
  );
}

/**
 * Enqueue scoring jobs for all active campaigns belonging to a tenant.
 *
 * "Active" means: campaigns with data in the last 90 days.
 * Enqueues individual 'score-campaign' jobs for each, so they can
 * be processed concurrently by the scoring worker pool.
 *
 * Called internally by the 'score-all-campaigns' job handler in workers.ts.
 *
 * @param tenantId    - Tenant UUID to score all campaigns for.
 * @param triggerType - What triggered this batch run.
 */
export async function enqueueFullTenantScoring(
  tenantId: string,
  triggerType: 'nightly' | 'manual' = 'nightly',
): Promise<void> {
  // Find all campaigns with data in the last 90 days
  const activeCampaigns = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT DISTINCT campaign_id::text AS campaign_id
      FROM campaign_metrics
      WHERE
        tenant_id = ${tenantId}::uuid
        AND date >= CURRENT_DATE - INTERVAL '90 days'
        AND spend_usd IS NOT NULL
        AND spend_usd > 0
    `);
    return result.rows as Array<{ campaign_id: string }>;
  });

  // Enqueue a scoring job for each active campaign
  for (const { campaign_id } of activeCampaigns) {
    await enqueueScoringJob(tenantId, campaign_id, triggerType);
  }
}

/**
 * Register the weekly model refit schedule for a tenant.
 *
 * Uses upsertJobScheduler to idempotently register a recurring job that
 * re-fits all statistical models on Sunday mornings at 4am UTC.
 *
 * STAT-07: Models automatically improve over time via weekly refitting
 * as more campaign data accumulates.
 *
 * Scheduler ID format: 'weekly-refit-{tenantId}' — one refit schedule per tenant.
 * Safe to call multiple times (upsertJobScheduler is idempotent).
 *
 * @param tenantId - Tenant UUID to register the weekly refit for.
 */
export async function registerWeeklyRefit(tenantId: string): Promise<void> {
  await scoringQueue.upsertJobScheduler(
    `weekly-refit-${tenantId}`,
    { pattern: '0 4 * * 0' }, // 4am UTC every Sunday
    {
      name: 'score-all-campaigns',
      data: {
        tenantId,
        triggerType: 'nightly',
      } satisfies TenantScoringJobData,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 20 },
      },
    },
  );
}
