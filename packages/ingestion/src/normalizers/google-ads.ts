import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, withTenant, campaigns, rawApiPulls, campaignMetrics, ingestionCoverage, integrations } from '@incremental-iq/db';
import { sql } from 'drizzle-orm';
import { decryptToken } from '../crypto';
import { getConnector } from '../connectors/index';
import type { ConnectorConfig, NormalizedMetric } from '../types';

/**
 * Google Ads two-stage raw-to-normalized ingestion pipeline.
 *
 * Stage 1 (storeRawPull): Inserts raw GAQL response into raw_api_pulls verbatim.
 *   - source: 'google_ads', apiVersion: 'v23'
 *   - normalized: false — not yet processed
 *
 * Stage 2 (normalizeGoogleAdsMetrics): Transforms raw rows into campaign_metrics.
 *   - cost_micros / 1_000_000 = USD (CRITICAL conversion)
 *   - average_cpm / 1_000_000 = CPM in USD
 *   - ctr passed through as decimal (Google provides as decimal, not percentage)
 *   - Upsert with 4-column conflict target: (tenantId, campaignId, date, source)
 *   - Updates rawApiPulls.normalized = true after success
 *
 * All DB operations use withTenant() for RLS context (RESEARCH.md Pitfall 6).
 */

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for a single GAQL metrics row from the Google Ads API.
 * Validates raw API responses before writing to raw_api_pulls.
 */
const GaqlMetricRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date format'),
  campaignId: z.string().min(1, 'campaignId is required'),
  campaignName: z.string().optional(),
  // Cost in micros — NOT yet converted to USD at this validation stage
  costMicros: z.number().min(0),
  clicks: z.number().min(0),
  impressions: z.number().min(0),
  ctr: z.number().min(0),
  // average_cpm also in micros
  averageCpm: z.number().min(0),
});

const GaqlMetricPayloadSchema = z.array(GaqlMetricRowSchema);

/**
 * Schema for a single campaign row from fetchCampaigns().
 */
const GaqlCampaignRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.string(),
});

const GaqlCampaignPayloadSchema = z.array(GaqlCampaignRowSchema);

// ---------------------------------------------------------------------------
// Stage 1: Store raw API pull
// ---------------------------------------------------------------------------

interface StoreRawPullParams {
  tenantId: string;
  apiParams: Record<string, unknown>;
  payload: unknown;
}

/**
 * Inserts the raw GAQL API response into raw_api_pulls.
 *
 * Stores the verbatim API response before any transformation.
 * If normalization schema changes, data can be re-normalized from raw.
 *
 * @returns The UUID of the created raw_api_pulls record
 */
export async function storeRawPull(params: StoreRawPullParams): Promise<string> {
  const { tenantId, apiParams, payload } = params;

  const [record] = await withTenant(tenantId, (tx) =>
    tx.insert(rawApiPulls).values({
      tenantId,
      source: 'google_ads',
      apiVersion: 'v23',
      apiParams,
      payload,
      normalized: false,
    }).returning({ id: rawApiPulls.id })
  );

  return record.id;
}

// ---------------------------------------------------------------------------
// Stage 2: Normalize raw pull into campaign_metrics
// ---------------------------------------------------------------------------

interface NormalizeGoogleAdsMetricsParams {
  tenantId: string;
  rawPullId: string;
  payload: unknown;
}

/**
 * Transforms raw GAQL results into campaign_metrics rows and upserts them.
 *
 * CRITICAL cost_micros conversion:
 *   Google Ads reports all monetary values in micros (1,000,000 micros = $1 USD).
 *   Both cost_micros and average_cpm are divided by 1,000,000 to get USD amounts.
 *
 * Campaign ID resolution:
 *   Maps Google's native campaign.id (externalId) to the internal UUID in campaigns table.
 *   Rows with no matching campaign UUID are skipped with a warning.
 *
 * Upsert conflict target: (tenantId, campaignId, date, source)
 *   Matches the uniqueIndex defined in packages/db/src/schema/metrics.ts.
 *   Idempotent — safe to run multiple times for the same date range.
 *
 * @returns Count of campaign_metrics rows upserted
 */
export async function normalizeGoogleAdsMetrics(
  params: NormalizeGoogleAdsMetricsParams,
): Promise<number> {
  const { tenantId, rawPullId, payload } = params;

  // Validate the raw payload before processing
  const parseResult = GaqlMetricPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new Error(
      `Invalid Google Ads GAQL payload for raw pull ${rawPullId}: ${parseResult.error.message}`,
    );
  }

  const rows = parseResult.data;
  if (rows.length === 0) {
    // Nothing to normalize — mark raw pull as normalized and return 0
    await withTenant(tenantId, (tx) =>
      tx.update(rawApiPulls)
        .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
        .where(eq(rawApiPulls.id, rawPullId))
    );
    return 0;
  }

  // Load campaign UUID map for externalId -> internal UUID lookup
  const campaignUuidMap = await withTenant(tenantId, (tx) =>
    tx.select({ id: campaigns.id, externalId: campaigns.externalId })
      .from(campaigns)
      .where(and(
        eq(campaigns.tenantId, tenantId),
        eq(campaigns.source, 'google_ads'),
      ))
  );

  const externalIdToUuid = new Map(
    campaignUuidMap.map((c) => [c.externalId, c.id]),
  );

  // Build normalized metric rows
  const normalizedRows: NormalizedMetric[] = [];

  for (const row of rows) {
    const campaignUuid = externalIdToUuid.get(row.campaignId);

    if (!campaignUuid) {
      // Campaign not yet in hierarchy — skip this row
      // The campaign sync step should have populated it before metrics fetch
      console.warn(
        `[google-ads normalizer] No campaign UUID found for externalId=${row.campaignId} (tenantId=${tenantId}). Skipping metrics row for date=${row.date}.`,
      );
      continue;
    }

    normalizedRows.push({
      date: row.date,
      tenantId,
      campaignId: campaignUuid,
      source: 'google_ads',
      // CRITICAL: cost_micros / 1_000_000 = USD
      spendUsd: (row.costMicros / 1_000_000).toFixed(4),
      impressions: String(row.impressions),
      clicks: String(row.clicks),
      // Google provides CTR as a decimal (e.g., 0.0234 = 2.34%)
      ctr: row.ctr.toFixed(6),
      // average_cpm also in micros — divide by 1,000,000 for USD CPM
      cpm: (row.averageCpm / 1_000_000).toFixed(4),
      // Direct attribution columns NULL for ad platforms (revenue comes from Shopify/CRM)
      directRevenue: undefined,
      directConversions: undefined,
      directRoas: undefined,
    });
  }

  if (normalizedRows.length === 0) {
    // All rows skipped (no matching campaigns) — still mark raw pull as normalized
    await withTenant(tenantId, (tx) =>
      tx.update(rawApiPulls)
        .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
        .where(eq(rawApiPulls.id, rawPullId))
    );
    return 0;
  }

  // Upsert into campaign_metrics with 4-column conflict target
  // (matches uniqueIndex in packages/db/src/schema/metrics.ts)
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
          spendUsd: sql`excluded.spend_usd`,
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          ctr: sql`excluded.ctr`,
          cpm: sql`excluded.cpm`,
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
// Campaign hierarchy sync
// ---------------------------------------------------------------------------

/**
 * Upserts the Google Ads campaign hierarchy into the campaigns table.
 * Called during processGoogleAdsSync before fetching metrics.
 */
async function syncCampaignHierarchy(
  tenantId: string,
  config: ConnectorConfig,
): Promise<void> {
  const connector = getConnector('google_ads');
  const rawCampaigns = await connector.fetchCampaigns(config);

  // Validate campaign payload before DB writes
  const parseResult = GaqlCampaignPayloadSchema.safeParse(rawCampaigns);
  if (!parseResult.success) {
    throw new Error(
      `Invalid Google Ads campaign payload: ${parseResult.error.message}`,
    );
  }

  const campaignRows = parseResult.data;

  // Upsert campaigns — no conflict target on externalId+source+tenantId in schema,
  // so we do a select-then-insert/update pattern
  await withTenant(tenantId, async (tx) => {
    for (const campaign of campaignRows) {
      const existing = await tx.select({ id: campaigns.id })
        .from(campaigns)
        .where(and(
          eq(campaigns.tenantId, tenantId),
          eq(campaigns.source, 'google_ads'),
          eq(campaigns.externalId, campaign.id),
        ))
        .limit(1);

      if (existing.length === 0) {
        await tx.insert(campaigns).values({
          tenantId,
          name: campaign.name,
          source: 'google_ads',
          externalId: campaign.id,
          status: campaign.status,
        });
      } else {
        await tx.update(campaigns)
          .set({ name: campaign.name, status: campaign.status })
          .where(eq(campaigns.id, existing[0].id));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

interface ProcessGoogleAdsSyncParams {
  tenantId: string;
  integrationId: string;
  dateRange: { start: string; end: string };
}

interface ProcessGoogleAdsSyncResult {
  recordsIngested: number;
  datesProcessed: number;
}

/**
 * Top-level orchestrator for a Google Ads sync run.
 *
 * Orchestration order (matches RESEARCH.md two-stage pipeline):
 *   1. Load integration record, decrypt OAuth tokens
 *   2. Sync campaign hierarchy (upsert into campaigns table)
 *   3. Fetch metrics for date range (raw GAQL results)
 *   4. Store raw pull in raw_api_pulls (Stage 1)
 *   5. Normalize into campaign_metrics (Stage 2)
 *   6. Update ingestion_coverage for each date in the range
 *
 * @returns Summary with count of records ingested and unique dates processed
 */
export async function processGoogleAdsSync(
  params: ProcessGoogleAdsSyncParams,
): Promise<ProcessGoogleAdsSyncResult> {
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

  if (!integration.encryptedAccessToken && !integration.encryptedRefreshToken) {
    throw new Error(`No tokens found for integration ${integrationId}`);
  }

  const metadata = integration.metadata as Record<string, unknown> | null;

  const config: ConnectorConfig = {
    tenantId,
    platform: 'google_ads',
    integrationId,
    credentials: {
      accessToken: integration.encryptedAccessToken
        ? decryptToken(integration.encryptedAccessToken)
        : '',
      refreshToken: integration.encryptedRefreshToken
        ? decryptToken(integration.encryptedRefreshToken)
        : undefined,
      metadata: metadata ?? undefined,
    },
  };

  // Step 2: Sync campaign hierarchy
  await syncCampaignHierarchy(tenantId, config);

  // Step 3: Fetch metrics for date range
  const connector = getConnector('google_ads');
  const rawMetrics = await connector.fetchMetrics(config, dateRange);

  // Step 4: Store raw pull
  const rawPullId = await storeRawPull({
    tenantId,
    apiParams: {
      dateRange,
      integrationId,
      apiVersion: 'v23',
    },
    payload: rawMetrics,
  });

  // Step 5: Normalize into campaign_metrics
  const recordsIngested = await normalizeGoogleAdsMetrics({
    tenantId,
    rawPullId,
    payload: rawMetrics,
  });

  // Step 6: Update ingestion_coverage for each date in the range
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const coverageDates: string[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    coverageDates.push(d.toISOString().split('T')[0]);
  }

  const datesProcessed = coverageDates.length;

  await withTenant(tenantId, async (tx) => {
    for (const coverageDate of coverageDates) {
      await tx.insert(ingestionCoverage).values({
        tenantId,
        source: 'google_ads',
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
