import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, withTenant, campaigns, adSets, ads, rawApiPulls, campaignMetrics, ingestionCoverage, integrations } from '@incremental-iq/db';
import { sql } from 'drizzle-orm';
import { decryptToken } from '../crypto';
import { getConnector } from '../connectors/index';
import type { ConnectorConfig, NormalizedMetric } from '../types';
import type { MetaRawCampaignData, MetaRawMetricData } from '../connectors/meta';

/**
 * Meta Ads two-stage raw-to-normalized ingestion pipeline.
 *
 * Stage 1 (storeRawPull): Inserts raw Meta Insights response into raw_api_pulls verbatim.
 *   - source: 'meta', apiVersion: 'v23.0'
 *   - attributionWindow stored alongside payload (RESEARCH.md Pitfall 1)
 *   - normalized: false -- not yet processed
 *
 * Stage 2 (normalizeMetaInsights): Transforms raw insights rows into campaign_metrics.
 *   - ctr parsed from percentage string to decimal (Meta provides as percentage)
 *   - Upsert with 4-column conflict target: (tenantId, campaignId, date, source)
 *     (RESEARCH.md Pitfall 8 -- all four columns required)
 *   - Updates rawApiPulls.normalized = true after success
 *
 * processMetaSync orchestrates both stages plus campaign hierarchy sync and
 * ingestion_coverage updates.
 *
 * All DB operations use withTenant() for RLS context (RESEARCH.md Pitfall 6).
 */

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

/**
 * Schema for a single Meta Insights row.
 * Validates raw API responses before writing to raw_api_pulls.
 *
 * Meta returns all numeric values as strings (e.g., spend: "12.34").
 * ctr is returned as a percentage string (e.g., "2.34" means 2.34%).
 */
const MetaInsightRowSchema = z.object({
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date format'),
  date_stop: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD date format'),
  campaign_id: z.string().min(1, 'campaign_id is required'),
  // Meta returns numeric values as strings
  spend: z.string().optional().default('0'),
  impressions: z.string().optional().default('0'),
  clicks: z.string().optional().default('0'),
  // ctr is a percentage string: "2.34" means 2.34% = 0.0234 decimal
  ctr: z.string().optional().default('0'),
  cpm: z.string().optional().default('0'),
  cpc: z.string().optional().default('0'),
});

const MetaInsightPayloadSchema = z.array(MetaInsightRowSchema);

/**
 * Schema for a single Meta campaign row from fetchCampaigns().
 */
const MetaCampaignRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.string(),
  adSets: z.array(z.object({
    id: z.string().min(1),
    name: z.string().optional().default(''),
    status: z.string(),
    ads: z.array(z.object({
      id: z.string().min(1),
      name: z.string().optional().default(''),
      status: z.string(),
    })),
  })).optional().default([]),
});

const MetaCampaignPayloadSchema = z.array(MetaCampaignRowSchema);

// ---------------------------------------------------------------------------
// Stage 1: Store raw API pull
// ---------------------------------------------------------------------------

interface StoreRawPullParams {
  tenantId: string;
  /** Attribution window used for this API call (RESEARCH.md Pitfall 1) */
  attributionWindow: string;
  apiParams: Record<string, unknown>;
  payload: unknown;
}

/**
 * Inserts the raw Meta Insights API response into raw_api_pulls.
 *
 * Stores the verbatim API response before any transformation.
 * The attributionWindow is stored alongside every pull so the normalizer
 * can detect and handle attribution window changes (RESEARCH.md Pitfall 1).
 *
 * If normalization schema changes (e.g., attribution window redefinition),
 * data can be re-normalized from raw without re-fetching from the API.
 *
 * @returns The UUID of the created raw_api_pulls record
 */
export async function storeRawPull(params: StoreRawPullParams): Promise<string> {
  const { tenantId, attributionWindow, apiParams, payload } = params;

  const [record] = await withTenant(tenantId, (tx) =>
    tx.insert(rawApiPulls).values({
      tenantId,
      source: 'meta',
      apiVersion: 'v23.0',
      attributionWindow,
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

interface NormalizeMetaInsightsParams {
  tenantId: string;
  rawPullId: string;
  payload: unknown;
}

/**
 * Transforms raw Meta Insights results into campaign_metrics rows and upserts them.
 *
 * CTR conversion:
 *   Meta returns ctr as a percentage string (e.g., "2.34" = 2.34%).
 *   This function divides by 100 to store as a decimal (0.0234).
 *
 * Campaign ID resolution:
 *   Maps Meta's native campaign_id (externalId) to the internal UUID in campaigns table.
 *   Rows with no matching campaign UUID are skipped with a warning.
 *   The campaign sync step (syncCampaignHierarchy) should run before this.
 *
 * Upsert conflict target: (tenantId, campaignId, date, source)
 *   Matches the uniqueIndex defined in packages/db/src/schema/metrics.ts.
 *   Idempotent -- safe to run multiple times for the same date range.
 *   RESEARCH.md Pitfall 8: all four columns MUST be in the conflict target.
 *
 * Direct attribution columns are NULL for Meta:
 *   Revenue comes from Shopify connector (Plan 05). Meta is spend-source only.
 *
 * @returns Count of campaign_metrics rows upserted
 */
export async function normalizeMetaInsights(
  params: NormalizeMetaInsightsParams,
): Promise<number> {
  const { tenantId, rawPullId, payload } = params;

  // Validate the raw payload before processing
  const parseResult = MetaInsightPayloadSchema.safeParse(payload);
  if (!parseResult.success) {
    throw new Error(
      `Invalid Meta Insights payload for raw pull ${rawPullId}: ${parseResult.error.message}`,
    );
  }

  const rows = parseResult.data;
  if (rows.length === 0) {
    // Nothing to normalize -- mark raw pull as normalized and return 0
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
        eq(campaigns.source, 'meta'),
      ))
  );

  const externalIdToUuid = new Map(
    campaignUuidMap.map((c) => [c.externalId, c.id]),
  );

  // Build normalized metric rows
  const normalizedRows: NormalizedMetric[] = [];

  for (const row of rows) {
    const campaignUuid = externalIdToUuid.get(row.campaign_id);

    if (!campaignUuid) {
      // Campaign not yet in hierarchy -- skip this row
      // The campaign sync step should have populated it before metrics fetch
      console.warn(
        `[meta normalizer] No campaign UUID found for externalId=${row.campaign_id} (tenantId=${tenantId}). Skipping metrics row for date=${row.date_start}.`,
      );
      continue;
    }

    // Meta returns ctr as percentage string (e.g., "2.34" = 2.34%)
    // Convert to decimal for storage: 2.34 / 100 = 0.0234
    const ctrDecimal = row.ctr
      ? (parseFloat(row.ctr) / 100).toFixed(6)
      : '0.000000';

    normalizedRows.push({
      date: row.date_start,
      tenantId,
      campaignId: campaignUuid,
      source: 'meta',
      // Meta reports in account currency -- stored as-is for v1
      // Currency normalization is a v2 concern (plan comment)
      spendUsd: row.spend,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: ctrDecimal,
      cpm: row.cpm,
      // Direct attribution NULL for ad platforms (revenue comes from Shopify)
      directRevenue: undefined,
      directConversions: undefined,
      directRoas: undefined,
    });
  }

  if (normalizedRows.length === 0) {
    // All rows skipped (no matching campaigns) -- still mark raw pull as normalized
    await withTenant(tenantId, (tx) =>
      tx.update(rawApiPulls)
        .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
        .where(eq(rawApiPulls.id, rawPullId))
    );
    return 0;
  }

  // Upsert into campaign_metrics with 4-column conflict target
  // RESEARCH.md Pitfall 8: must use all four columns or get duplicates
  // Matches uniqueIndex in packages/db/src/schema/metrics.ts
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
 * Upserts the Meta campaign hierarchy (campaigns -> ad sets -> ads) into the DB.
 *
 * Called during processMetaSync before fetching metrics to ensure
 * campaign UUIDs are available for metric row lookup.
 *
 * Uses a select-then-insert/update pattern since the campaigns table
 * does not have a unique constraint on (tenantId, source, externalId)
 * that would allow a single upsert statement.
 */
async function syncCampaignHierarchy(
  tenantId: string,
  config: ConnectorConfig,
): Promise<void> {
  const connector = getConnector('meta');
  const rawCampaigns = await connector.fetchCampaigns(config);

  // Validate campaign payload before DB writes
  const parseResult = MetaCampaignPayloadSchema.safeParse(rawCampaigns);
  if (!parseResult.success) {
    throw new Error(
      `Invalid Meta campaign payload: ${parseResult.error.message}`,
    );
  }

  const campaignRows = parseResult.data as z.infer<typeof MetaCampaignPayloadSchema>;

  await withTenant(tenantId, async (tx) => {
    for (const campaign of campaignRows) {
      // Upsert campaign
      const existingCampaigns = await tx.select({ id: campaigns.id })
        .from(campaigns)
        .where(and(
          eq(campaigns.tenantId, tenantId),
          eq(campaigns.source, 'meta'),
          eq(campaigns.externalId, campaign.id),
        ))
        .limit(1);

      let campaignId: string;

      if (existingCampaigns.length === 0) {
        const [inserted] = await tx.insert(campaigns).values({
          tenantId,
          name: campaign.name,
          source: 'meta',
          externalId: campaign.id,
          status: campaign.status,
        }).returning({ id: campaigns.id });
        campaignId = inserted.id;
      } else {
        campaignId = existingCampaigns[0].id;
        await tx.update(campaigns)
          .set({ name: campaign.name, status: campaign.status })
          .where(eq(campaigns.id, campaignId));
      }

      // Upsert ad sets for this campaign
      for (const adSet of campaign.adSets) {
        const existingAdSets = await tx.select({ id: adSets.id })
          .from(adSets)
          .where(and(
            eq(adSets.tenantId, tenantId),
            eq(adSets.externalId, adSet.id),
            eq(adSets.campaignId, campaignId),
          ))
          .limit(1);

        let adSetId: string;

        if (existingAdSets.length === 0) {
          const [insertedAdSet] = await tx.insert(adSets).values({
            tenantId,
            campaignId,
            externalId: adSet.id,
            name: adSet.name,
            status: adSet.status,
          }).returning({ id: adSets.id });
          adSetId = insertedAdSet.id;
        } else {
          adSetId = existingAdSets[0].id;
          await tx.update(adSets)
            .set({ name: adSet.name, status: adSet.status })
            .where(eq(adSets.id, adSetId));
        }

        // Upsert ads for this ad set
        for (const ad of adSet.ads) {
          const existingAds = await tx.select({ id: ads.id })
            .from(ads)
            .where(and(
              eq(ads.tenantId, tenantId),
              eq(ads.externalId, ad.id),
              eq(ads.adSetId, adSetId),
            ))
            .limit(1);

          if (existingAds.length === 0) {
            await tx.insert(ads).values({
              tenantId,
              adSetId,
              externalId: ad.id,
              name: ad.name,
              status: ad.status,
            });
          } else {
            await tx.update(ads)
              .set({ name: ad.name, status: ad.status })
              .where(eq(ads.id, existingAds[0].id));
          }
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Top-level orchestrator
// ---------------------------------------------------------------------------

interface ProcessMetaSyncParams {
  tenantId: string;
  integrationId: string;
  dateRange: { start: string; end: string };
}

interface ProcessMetaSyncResult {
  recordsIngested: number;
  datesProcessed: number;
}

/**
 * Top-level orchestrator for a Meta Ads sync run.
 *
 * Orchestration order (matches RESEARCH.md two-stage pipeline):
 *   1. Load integration record, decrypt OAuth tokens
 *   2. Refresh token if within 7 days of expiry (Meta long-lived tokens, ~60 days)
 *   3. Sync campaign hierarchy (upsert into campaigns/ad_sets/ads tables)
 *   4. Fetch metrics for date range (raw Meta Insights results)
 *   5. Store raw pull in raw_api_pulls (Stage 1) -- attributionWindow alongside payload
 *   6. Normalize into campaign_metrics (Stage 2) -- upsert with 4-column conflict target
 *   7. Update ingestion_coverage for each date in the range
 *
 * RESEARCH.md Pitfall 6: all DB operations use withTenant() for RLS context.
 * RESEARCH.md Pitfall 1: attribution window stored alongside every raw pull.
 *
 * @returns Summary with count of records ingested and unique dates processed
 */
export async function processMetaSync(
  params: ProcessMetaSyncParams,
): Promise<ProcessMetaSyncResult> {
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
    throw new Error(`No access token found for Meta integration ${integrationId}`);
  }

  const metadata = integration.metadata as Record<string, unknown> | null;

  const config: ConnectorConfig = {
    tenantId,
    platform: 'meta',
    integrationId,
    credentials: {
      accessToken: decryptToken(integration.encryptedAccessToken),
      refreshToken: integration.encryptedRefreshToken
        ? decryptToken(integration.encryptedRefreshToken)
        : undefined,
      metadata: metadata ?? undefined,
    },
  };

  // Step 2: Refresh token if close to expiry (Meta long-lived tokens, ~60 days)
  const connector = getConnector('meta');
  const freshCredentials = await connector.refreshTokenIfNeeded(config);
  config.credentials = freshCredentials;

  // Step 3: Sync campaign hierarchy (ensures campaign UUIDs exist before metrics)
  await syncCampaignHierarchy(tenantId, config);

  // Step 4: Fetch metrics for date range
  const rawMetrics = await connector.fetchMetrics(config, dateRange);

  // Step 5: Store raw pull (Stage 1)
  // Attribution window: after Jan 2026, Meta unified to '7d_click' by default
  // Stored so normalizer can detect attribution window changes (RESEARCH.md Pitfall 1)
  const attributionWindow = '7d_click';

  const rawPullId = await storeRawPull({
    tenantId,
    attributionWindow,
    apiParams: {
      dateRange,
      integrationId,
      apiVersion: 'v23.0',
      level: 'campaign',
      time_increment: 1,
    },
    payload: rawMetrics,
  });

  // Step 6: Normalize into campaign_metrics (Stage 2)
  const recordsIngested = await normalizeMetaInsights({
    tenantId,
    rawPullId,
    payload: rawMetrics,
  });

  // Step 7: Update ingestion_coverage for each date in the range
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
        source: 'meta',
        coverageDate,
        status: recordsIngested > 0 ? 'complete' : 'partial',
        recordCount: String(recordsIngested),
      });
    }
  });

  return { recordsIngested, datesProcessed };
}

// Re-export for use in tests and other normalizers
export type { MetaRawCampaignData, MetaRawMetricData };
