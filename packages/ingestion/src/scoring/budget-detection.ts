/**
 * Budget change detection for campaign spend shifts.
 *
 * Detects when a campaign's spend has changed significantly by comparing
 * rolling 14-day averages before and after a potential change point.
 *
 * Pitfall 5 mitigation (RESEARCH.md): Applies 3-day rolling average smoothing
 * to spend data BEFORE threshold comparison — avoids billing cycle false positives
 * (monthly resets, mid-month adjustments that mimic genuine budget cuts).
 *
 * Part of the scoring pipeline: runs after nightly sync, before scoring jobs
 * are dispatched to the Python analysis engine.
 *
 * STAT-04: Budget change detection as a trigger for pre/post ITS analysis.
 */

import { sql } from 'drizzle-orm';
import { budgetChanges } from '@incremental-iq/db';
import { db, withTenant } from '@incremental-iq/db';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Default budget change detection threshold.
 *
 * Per user decision: only significant budget changes (>20%) should trigger
 * ITS analysis. Configurable via BUDGET_CHANGE_THRESHOLD env var so operators
 * can tune without a code deploy.
 *
 * Previous value: 0.25 (25%) — changed to 0.20 (20%) per user decision.
 */
const BUDGET_CHANGE_THRESHOLD = parseFloat(
  process.env.BUDGET_CHANGE_THRESHOLD ?? '0.20',
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A detected budget change event for a campaign.
 *
 * Represents a significant shift in campaign spend identified by comparing
 * smoothed 14-day rolling averages on either side of a potential change point.
 */
export interface BudgetChangeEvent {
  /** Tenant that owns this campaign. */
  tenantId: string;
  /** Campaign where the spend change was detected. */
  campaignId: string;
  /** Approximate date of the change (midpoint of the detection window). ISO date string. */
  changeDate: string;
  /** 14-day smoothed average spend (USD) in the pre-change period (days 28–15 ago). */
  spendBeforeAvg: number;
  /** 14-day smoothed average spend (USD) in the post-change period (days 14–1 ago). */
  spendAfterAvg: number;
  /**
   * Signed percentage change: positive = spend increase, negative = spend decrease.
   * e.g., 0.35 = 35% increase, -0.25 = 25% decrease.
   */
  changePct: number;
}

// ---------------------------------------------------------------------------
// Core detection function
// ---------------------------------------------------------------------------

/**
 * Detect a significant budget change for a single campaign.
 *
 * Algorithm:
 * 1. Query campaign_metrics for the last 60 days of daily spend.
 * 2. Apply 3-day rolling average smoothing to spend via SQL window function
 *    (Pitfall 5: avoids billing cycle noise before comparison).
 * 3. Compare 14-day rolling averages:
 *    - pre  = average of smoothed spend from days 28–15 ago
 *    - post = average of smoothed spend from days 14–1 ago
 * 4. If |post - pre| / pre > thresholdPct (default 0.20), return a BudgetChangeEvent.
 * 5. Otherwise return null (no significant change detected).
 *
 * @param tenantId    - Tenant UUID for RLS context.
 * @param campaignId  - Campaign UUID to check.
 * @param thresholdPct - Fractional threshold for change detection (default 0.20 = 20%).
 *                       Override via BUDGET_CHANGE_THRESHOLD env var or pass explicitly.
 * @returns BudgetChangeEvent if a significant change is detected, null otherwise.
 */
export async function detectBudgetChanges(
  tenantId: string,
  campaignId: string,
  thresholdPct: number = BUDGET_CHANGE_THRESHOLD,
): Promise<BudgetChangeEvent | null> {
  // Use withTenant for RLS context — all queries must run inside the tenant session
  return withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      WITH smoothed AS (
        -- Step 1: Get last 60 days of daily spend with 3-day smoothing
        -- Pitfall 5 mitigation: 3-day rolling average before comparison
        SELECT
          date,
          spend_usd,
          AVG(spend_usd::numeric) OVER (
            ORDER BY date
            ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
          ) AS smoothed_spend
        FROM campaign_metrics
        WHERE
          tenant_id = ${tenantId}::uuid
          AND campaign_id = ${campaignId}::uuid
          AND date >= CURRENT_DATE - INTERVAL '60 days'
          AND spend_usd IS NOT NULL
        ORDER BY date
      ),
      windows AS (
        -- Step 2: Compute 14-day rolling averages from the smoothed series
        --   pre_avg  = days 28–15 ago (before the potential change)
        --   post_avg = days 14–1 ago  (after the potential change)
        SELECT
          AVG(smoothed_spend) FILTER (
            WHERE date BETWEEN CURRENT_DATE - INTERVAL '28 days'
                           AND CURRENT_DATE - INTERVAL '15 days'
          ) AS pre_avg,
          AVG(smoothed_spend) FILTER (
            WHERE date BETWEEN CURRENT_DATE - INTERVAL '14 days'
                           AND CURRENT_DATE - INTERVAL '1 day'
          ) AS post_avg
        FROM smoothed
      )
      SELECT
        pre_avg,
        post_avg,
        CASE
          WHEN pre_avg IS NOT NULL AND pre_avg != 0
          THEN (post_avg - pre_avg) / ABS(pre_avg)
          ELSE NULL
        END AS change_pct,
        -- Approximate midpoint: 15 days ago
        (CURRENT_DATE - INTERVAL '15 days')::text AS change_date
      FROM windows
      WHERE
        pre_avg IS NOT NULL
        AND post_avg IS NOT NULL
        AND pre_avg != 0
        AND ABS((post_avg - pre_avg) / ABS(pre_avg)) > ${thresholdPct}
    `);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      pre_avg: string;
      post_avg: string;
      change_pct: string;
      change_date: string;
    };

    const spendBeforeAvg = parseFloat(row.pre_avg);
    const spendAfterAvg = parseFloat(row.post_avg);
    const changePct = parseFloat(row.change_pct);

    return {
      tenantId,
      campaignId,
      changeDate: row.change_date,
      spendBeforeAvg,
      spendAfterAvg,
      changePct,
    };
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist a detected budget change event to the budget_changes table.
 *
 * Uses source='auto_detected' and status='pending_analysis' — the record
 * is ready for CausalPy ITS scoring in the next scoring job dispatch.
 *
 * @param event - The BudgetChangeEvent returned by detectBudgetChanges().
 */
export async function persistBudgetChange(event: BudgetChangeEvent): Promise<void> {
  await withTenant(event.tenantId, async () => {
    await db.insert(budgetChanges).values({
      tenantId: event.tenantId,
      campaignId: event.campaignId,
      changeDate: event.changeDate,
      spendBefore: event.spendBeforeAvg.toFixed(4),
      spendAfter: event.spendAfterAvg.toFixed(4),
      changePct: event.changePct.toFixed(4),
      source: 'auto_detected',
      status: 'pending_analysis',
    });
  });
}

// ---------------------------------------------------------------------------
// Batch scan
// ---------------------------------------------------------------------------

/**
 * Scan all active campaigns for a tenant and detect budget changes.
 *
 * "Active" means: campaigns with any spend recorded in the last 30 days.
 * Runs detectBudgetChanges() for each, filters nulls, persists all detected
 * changes to budget_changes table.
 *
 * Called by the nightly scoring scheduler after sync completes, before
 * scoring jobs are dispatched to the Python analysis engine.
 *
 * @param tenantId - Tenant UUID to scan.
 * @returns Array of all detected BudgetChangeEvents (persisted to DB).
 */
export async function scanAllCampaignsForBudgetChanges(
  tenantId: string,
): Promise<BudgetChangeEvent[]> {
  // Find all active campaigns (have spend data in last 30 days)
  const activeCampaigns = await withTenant(tenantId, async () => {
    const result = await db.execute(sql`
      SELECT DISTINCT campaign_id::text AS campaign_id
      FROM campaign_metrics
      WHERE
        tenant_id = ${tenantId}::uuid
        AND date >= CURRENT_DATE - INTERVAL '30 days'
        AND spend_usd IS NOT NULL
        AND spend_usd > 0
    `);
    return result.rows as Array<{ campaign_id: string }>;
  });

  // Detect changes for each active campaign
  const detectedChanges: BudgetChangeEvent[] = [];

  for (const { campaign_id } of activeCampaigns) {
    const event = await detectBudgetChanges(tenantId, campaign_id);
    if (event !== null) {
      await persistBudgetChange(event);
      detectedChanges.push(event);
    }
  }

  return detectedChanges;
}
