import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, withTenant, campaigns, rawApiPulls, campaignMetrics, ingestionCoverage, integrations } from '@incremental-iq/db';
import { sql } from 'drizzle-orm';
import { decryptToken } from '../crypto';
import { getConnector } from '../connectors/index';
import type { ConnectorConfig, NormalizedMetric } from '../types';
import type { ShopifyRawMetricData } from '../connectors/shopify';

/**
 * Shopify order two-stage raw-to-normalized ingestion pipeline.
 *
 * Shopify is the REVENUE source (outcome variable), not a spend source.
 * This is the most important data for incrementality analysis — it provides
 * the ground truth against which ad spend effectiveness is measured.
 *
 * Stage 1 (storeRawPull): Inserts raw order data into raw_api_pulls verbatim.
 *   - source: 'shopify', no attributionWindow (n/a for orders)
 *   - normalized: false -- not yet processed
 *
 * Stage 2 (normalizeShopifyOrders): Aggregates orders by date into campaign_metrics.
 *   - directRevenue: sum of totalPriceSet.shopMoney.amount per date
 *   - directConversions: count of orders per date
 *   - directRoas: NULL (requires spend data from Meta/Google — computed in Phase 3)
 *   - spendUsd, impressions, clicks, ctr, cpm: all NULL (Shopify is not an ad platform)
 *   - Upsert with 4-column conflict target: (tenantId, campaignId, date, source)
 *     (RESEARCH.md Pitfall 8 -- all four columns required)
 *
 * Synthetic campaign:
 *   Shopify orders are attributed to a per-tenant "shopify-revenue" synthetic campaign.
 *   Per-campaign revenue attribution requires UTM tracking (Phase 3/4 concern).
 *
 * Currency handling:
 *   shopMoney always returns the shop's default currency (not presentment currency).
 *   Multi-currency normalization is a v2 concern — for v1 we store shopMoney amounts.
 *
 * All DB operations use withTenant() for RLS context (RESEARCH.md Pitfall 6).
 */

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for a single Shopify order row.
 * Validates raw API responses before writing to raw_api_pulls.
 */
const ShopifyOrderRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date format'),
  campaignId: z.string(),
  processedAt: z.string().datetime({ offset: true }),
  // totalPriceAmount is a numeric string from Shopify (e.g., "123.45")
  totalPriceAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Expected numeric string amount'),
  currencyCode: z.string().length(3, 'Expected 3-letter currency code'),
  subtotalPriceAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Expected numeric string amount'),
  totalDiscountsAmount: z.string().regex(/^\d+(\.\d+)?$/, 'Expected numeric string amount'),
});

const ShopifyOrderPayloadSchema = z.array(ShopifyOrderRowSchema);

// ---------------------------------------------------------------------------
// Stage 1: Store raw API pull
// ---------------------------------------------------------------------------

interface StoreShopifyRawPullParams {
  tenantId: string;
  apiParams: Record<string, unknown>;
  payload: unknown;
}

/**
 * Inserts the raw Shopify order data into raw_api_pulls.
 *
 * Stores the verbatim order array before any aggregation or transformation.
 * If the normalization schema changes (e.g., revenue calculation changes),
 * data can be re-normalized from raw without re-fetching from the API.
 *
 * No attributionWindow for Shopify — orders are not subject to attribution windows.
 *
 * @returns The UUID of the created raw_api_pulls record
 */
export async function storeRawPull(params: StoreShopifyRawPullParams): Promise<string> {
  const { tenantId, apiParams, payload } = params;

  const [record] = await withTenant(tenantId, (tx) =>
    tx.insert(rawApiPulls).values({
      tenantId,
      source: 'shopify',
      apiVersion: LATEST_API_VERSION,
      apiParams,
      payload,
      normalized: false,
    }).returning({ id: rawApiPulls.id })
  );

  return record.id;
}

/** Shopify API version string for raw pull records */
const LATEST_API_VERSION = '2025-10';

// ---------------------------------------------------------------------------
// Stage 2: Normalize raw pull into campaign_metrics
// ---------------------------------------------------------------------------

interface NormalizeShopifyOrdersParams {
  tenantId: string;
  rawPullId: string;
  payload: unknown;
}

/**
 * Aggregates raw Shopify order data into campaign_metrics rows with direct attribution.
 *
 * Aggregation strategy:
 *   Groups orders by processedAt date. For each date:
 *   - directRevenue = SUM(totalPriceSet.shopMoney.amount)
 *   - directConversions = COUNT(orders)
 *   - directRoas = NULL (requires ad spend from Meta/Google — Phase 3 concern)
 *
 * Synthetic campaign:
 *   All orders are attributed to the per-tenant "shopify-revenue" campaign.
 *   This campaign must exist in the campaigns table (ensured by processShopifySync).
 *
 * Upsert semantics:
 *   Uses onConflictDoUpdate with (tenantId, campaignId, date, source) target.
 *   Updates directRevenue + directConversions on conflict (new orders in same day).
 *   RESEARCH.md Pitfall 8: must use all four columns in conflict target.
 *
 * @returns Count of date-rows upserted into campaign_metrics
 */
export async function normalizeShopifyOrders(
  params: NormalizeShopifyOrdersParams,
): Promise<number> {
  const { tenantId, rawPullId, payload } = params;

  // Validate raw payload before processing
  const parseResult = ShopifyOrderPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new Error(
      `Invalid Shopify order payload for raw pull ${rawPullId}: ${parseResult.error.message}`,
    );
  }

  const rows = parseResult.data;

  if (rows.length === 0) {
    // No orders to normalize -- mark raw pull as normalized and return 0
    await withTenant(tenantId, (tx) =>
      tx.update(rawApiPulls)
        .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
        .where(eq(rawApiPulls.id, rawPullId))
    );
    return 0;
  }

  // Look up the synthetic "shopify-revenue" campaign UUID for this tenant
  const [syntheticCampaign] = await withTenant(tenantId, (tx) =>
    tx.select({ id: campaigns.id })
      .from(campaigns)
      .where(and(
        eq(campaigns.tenantId, tenantId),
        eq(campaigns.source, 'shopify'),
        eq(campaigns.externalId, 'shopify-revenue'),
      ))
      .limit(1)
  );

  if (!syntheticCampaign) {
    throw new Error(
      `Synthetic "shopify-revenue" campaign not found for tenant ${tenantId}. ` +
      `processShopifySync must call ensureSyntheticCampaign before normalizing.`,
    );
  }

  const campaignUuid = syntheticCampaign.id;

  // Aggregate orders by date: sum revenue, count conversions
  // Map: date → { directRevenue (sum in cents), directConversions (count) }
  const dateAggregates = new Map<string, { revenueAccumulator: number; conversions: number }>();

  for (const row of rows) {
    const existing = dateAggregates.get(row.date);
    const amount = parseFloat(row.totalPriceAmount);

    if (existing) {
      existing.revenueAccumulator += amount;
      existing.conversions += 1;
    } else {
      dateAggregates.set(row.date, {
        revenueAccumulator: amount,
        conversions: 1,
      });
    }
  }

  // Build normalized metric rows — one per date
  const normalizedRows: NormalizedMetric[] = [];

  for (const [date, agg] of dateAggregates) {
    normalizedRows.push({
      date,
      tenantId,
      campaignId: campaignUuid,
      source: 'shopify',
      // Shopify is a revenue source, not a spend source
      spendUsd: undefined,
      impressions: undefined,
      clicks: undefined,
      ctr: undefined,
      cpm: undefined,
      // ARCH-02: Direct attribution columns — populated by Shopify connector
      directRevenue: agg.revenueAccumulator.toFixed(4),
      directConversions: String(agg.conversions),
      // directRoas requires ad spend from Meta/Google — computed in Phase 3
      directRoas: undefined,
    });
  }

  // Upsert into campaign_metrics
  // RESEARCH.md Pitfall 8: conflict target MUST include all four columns
  await withTenant(tenantId, (tx) =>
    tx.insert(campaignMetrics)
      .values(normalizedRows)
      .onConflictDoUpdate({
        target: [
          campaignMetrics.tenantId,
          campaignMetrics.campaignId,
          campaignMetrics.date,
          campaignMetrics.source,
        ],
        set: {
          // Update direct attribution columns on conflict
          directRevenue: sql`excluded.direct_revenue`,
          directConversions: sql`excluded.direct_conversions`,
        },
      })
  );

  // Mark raw pull as normalized
  await withTenant(tenantId, (tx) =>
    tx.update(rawApiPulls)
      .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
      .where(eq(rawApiPulls.id, rawPullId))
  );

  return normalizedRows.length;
}

// ---------------------------------------------------------------------------
// Synthetic campaign management
// ---------------------------------------------------------------------------

/**
 * Ensures the synthetic "shopify-revenue" campaign exists for this tenant.
 *
 * Phase 2 uses a synthetic per-tenant campaign to aggregate all Shopify revenue.
 * Per-campaign revenue attribution via UTM parameters is a Phase 3/4 concern.
 *
 * Idempotent — safe to call on every sync run.
 *
 * @returns The internal UUID of the synthetic campaign
 */
export async function ensureSyntheticCampaign(tenantId: string): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    const existing = await tx.select({ id: campaigns.id })
      .from(campaigns)
      .where(and(
        eq(campaigns.tenantId, tenantId),
        eq(campaigns.source, 'shopify'),
        eq(campaigns.externalId, 'shopify-revenue'),
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const [inserted] = await tx.insert(campaigns).values({
      tenantId,
      name: 'Shopify Revenue (All Orders)',
      source: 'shopify',
      externalId: 'shopify-revenue',
      status: 'active',
    }).returning({ id: campaigns.id });

    return inserted.id;
  });
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

interface ProcessShopifySyncParams {
  tenantId: string;
  integrationId: string;
  dateRange: { start: string; end: string };
}

interface ProcessShopifySyncResult {
  recordsIngested: number;
  datesProcessed: number;
}

/**
 * Top-level orchestrator for a Shopify sync run.
 *
 * Orchestration order (matches RESEARCH.md two-stage pipeline):
 *   1. Load integration record, decrypt OAuth tokens
 *   2. Refresh token if expired (Shopify 1-hour expiry since Dec 2025 — Pitfall 4)
 *   3. Ensure synthetic "shopify-revenue" campaign exists for this tenant
 *   4. Choose sync path based on date range:
 *      - ≤30 days: fetchMetrics (standard GraphQL pagination)
 *      - >30 days: fetchMetricsBulk (Bulk Operations API with JSONL streaming)
 *   5. Store raw pull in raw_api_pulls (Stage 1)
 *   6. Normalize into campaign_metrics (Stage 2) — aggregate by date into directRevenue
 *   7. Update ingestion_coverage for each date in the range
 *
 * RESEARCH.md Pitfall 6: all DB operations use withTenant() for RLS context.
 *
 * @returns Summary with count of date-rows ingested and unique dates processed
 */
export async function processShopifySync(
  params: ProcessShopifySyncParams,
): Promise<ProcessShopifySyncResult> {
  const { tenantId, integrationId, dateRange } = params;

  // Step 1: Load integration and decrypt credentials
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
    throw new Error(`No access token found for Shopify integration ${integrationId}`);
  }

  const metadata = integration.metadata as Record<string, unknown> | null;

  const config: ConnectorConfig = {
    tenantId,
    platform: 'shopify',
    integrationId,
    credentials: {
      accessToken: decryptToken(integration.encryptedAccessToken),
      refreshToken: integration.encryptedRefreshToken
        ? decryptToken(integration.encryptedRefreshToken)
        : undefined,
      metadata: metadata ?? undefined,
    },
  };

  // Step 2: Refresh token if expired (Shopify 1-hour expiry since Dec 2025)
  const connector = getConnector('shopify');
  const freshCredentials = await connector.refreshTokenIfNeeded(config);
  config.credentials = freshCredentials;

  // Step 3: Ensure synthetic "shopify-revenue" campaign exists for this tenant
  await ensureSyntheticCampaign(tenantId);

  // Step 4: Choose sync path based on date range
  // >30 days: use Bulk Operations API to bypass rate limits (RESEARCH.md Pattern 6)
  // ≤30 days: use standard GraphQL pagination (incremental sync)
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  let rawOrders: ShopifyRawMetricData[];

  if (daysDiff > 30) {
    // Backfill path: Bulk Operations API
    // fetchMetricsBulk is not on the PlatformConnector interface (Shopify-specific)
    // Import ShopifyConnector directly to access the bulk method
    const { ShopifyConnector } = await import('../connectors/shopify');
    const shopifyConnector = new ShopifyConnector();
    rawOrders = await shopifyConnector.fetchMetricsBulk(config, dateRange);
  } else {
    // Incremental path: standard GraphQL pagination
    rawOrders = await connector.fetchMetrics(config, dateRange) as ShopifyRawMetricData[];
  }

  // Step 5: Store raw pull in raw_api_pulls (Stage 1)
  const rawPullId = await storeRawPull({
    tenantId,
    apiParams: {
      dateRange,
      integrationId,
      syncPath: daysDiff > 30 ? 'bulk' : 'incremental',
      apiVersion: LATEST_API_VERSION,
    },
    payload: rawOrders,
  });

  // Step 6: Normalize into campaign_metrics (Stage 2)
  const recordsIngested = await normalizeShopifyOrders({
    tenantId,
    rawPullId,
    payload: rawOrders,
  });

  // Step 7: Update ingestion_coverage for each date in the range
  const coverageDates: string[] = [];
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    coverageDates.push(d.toISOString().split('T')[0]);
  }

  const datesProcessed = coverageDates.length;

  await withTenant(tenantId, async (tx) => {
    for (const coverageDate of coverageDates) {
      await tx.insert(ingestionCoverage).values({
        tenantId,
        source: 'shopify',
        coverageDate,
        status: recordsIngested > 0 ? 'complete' : 'partial',
        recordCount: String(recordsIngested),
      }).onConflictDoUpdate({
        target: [ingestionCoverage.tenantId, ingestionCoverage.source, ingestionCoverage.coverageDate],
        set: {
          status: sql`excluded.status`,
          recordCount: sql`excluded.record_count`,
          ingestedAt: sql`NOW()`,
        },
      });
    }
  });

  return { recordsIngested, datesProcessed };
}

// Re-export for use in tests and other modules
export type { ShopifyRawMetricData };
