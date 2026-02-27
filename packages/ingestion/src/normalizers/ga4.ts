import { eq, and } from 'drizzle-orm';
import { db, withTenant, campaigns, rawApiPulls, campaignMetrics, ingestionCoverage, integrations } from '@incremental-iq/db';
import { sql } from 'drizzle-orm';
import { decryptToken } from '../crypto';
import { GA4Connector } from '../connectors/ga4';
import type { NormalizedMetric } from '../types';

/**
 * GA4 two-stage raw-to-normalized ingestion pipeline.
 *
 * GA4 is the LEAD-GEN outcome source (RESEARCH.md Pattern 10):
 *   Lead counts are stored in `directConversions` (not directRevenue).
 *   Used when tenant.outcomeMode = 'lead_gen'.
 *
 * Stage 1 (storeRawPull): Inserts raw GA4 Data API response into raw_api_pulls.
 *   - source: 'ga4', apiVersion: 'data-v1beta'
 *   - normalized: false
 *
 * Stage 2 (normalizeGA4Events): Transforms daily event counts into campaign_metrics.
 *   - directConversions: sum of selected key event counts per date
 *   - Synthetic 'ga4-leads' campaign (per-tenant) — mirrors Shopify pattern
 *   - 4-column upsert conflict target (tenantId, campaignId, date, source='ga4')
 *
 * Synthetic campaign:
 *   GA4 lead counts are attributed to a per-tenant "ga4-leads" synthetic campaign.
 *   Per-campaign attribution via UTM parameters is a v2 concern.
 *
 * Date normalization (RESEARCH.md Pitfall 1):
 *   GA4 Data API returns dates as 'YYYYMMDD'. The GA4Connector.fetchLeadCounts()
 *   normalizes these to 'YYYY-MM-DD' before returning — normalizer sees ISO dates.
 *
 * All DB operations use withTenant() for RLS context.
 */

// ---------------------------------------------------------------------------
// Stage 1: Store raw API pull
// ---------------------------------------------------------------------------

interface StoreGA4RawPullParams {
  tenantId: string;
  apiParams: Record<string, unknown>;
  payload: unknown;
}

/**
 * Inserts the raw GA4 Data API response into raw_api_pulls.
 *
 * Stores the verbatim Map<date, count> payload before any transformation.
 * If normalization schema changes (e.g., event selection changes), data can
 * be re-normalized from raw without re-fetching from the API.
 *
 * @returns The UUID of the created raw_api_pulls record
 */
export async function storeGA4RawPull(params: StoreGA4RawPullParams): Promise<string> {
  const { tenantId, apiParams, payload } = params;

  const rows: { id: string }[] = await withTenant(tenantId, (tx) =>
    tx.insert(rawApiPulls).values({
      tenantId,
      source: 'ga4',
      apiVersion: 'data-v1beta',
      apiParams,
      payload,
      normalized: false,
    }).returning({ id: rawApiPulls.id })
  );

  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Synthetic campaign management
// ---------------------------------------------------------------------------

/**
 * Ensures the synthetic "ga4-leads" campaign exists for this tenant.
 *
 * Phase 5 uses a synthetic per-tenant campaign to aggregate all GA4 lead counts.
 * Per-campaign attribution via UTM parameters is a v2 concern.
 *
 * Idempotent — safe to call on every sync run.
 *
 * @returns The internal UUID of the synthetic campaign
 */
export async function ensureGA4SyntheticCampaign(tenantId: string): Promise<string> {
  return withTenant(tenantId, async (tx) => {
    const existing = await tx.select({ id: campaigns.id })
      .from(campaigns)
      .where(and(
        eq(campaigns.tenantId, tenantId),
        eq(campaigns.source, 'ga4'),
        eq(campaigns.externalId, 'ga4-leads'),
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    const [inserted] = await tx.insert(campaigns).values({
      tenantId,
      name: 'GA4 Leads (Selected Key Events)',
      source: 'ga4',
      externalId: 'ga4-leads',
      status: 'active',
    }).returning({ id: campaigns.id });

    return inserted.id;
  });
}

// ---------------------------------------------------------------------------
// Stage 2: Normalize into campaign_metrics
// ---------------------------------------------------------------------------

interface NormalizeGA4EventsParams {
  tenantId: string;
  rawPullId: string;
  /** Map<date 'YYYY-MM-DD', totalLeadCount> */
  dailyCounts: Map<string, number>;
  campaignId: string;
}

/**
 * Transforms GA4 daily lead counts into campaign_metrics rows.
 *
 * Lead counts are stored in directConversions — GA4 is a lead-gen outcome source,
 * not a revenue source (RESEARCH.md Pattern 10).
 *
 * Upsert semantics:
 *   Uses onConflictDoUpdate with (tenantId, campaignId, date, source) target.
 *   Idempotent — safe to re-run for the same date range.
 *
 * @returns Count of date-rows upserted
 */
export async function normalizeGA4Events(
  params: NormalizeGA4EventsParams,
): Promise<number> {
  const { tenantId, rawPullId, dailyCounts, campaignId } = params;

  if (dailyCounts.size === 0) {
    await withTenant(tenantId, (tx) =>
      tx.update(rawApiPulls)
        .set({ normalized: true, normalizedAt: new Date(), schemaVersion: '1.0' })
        .where(eq(rawApiPulls.id, rawPullId))
    );
    return 0;
  }

  // Build normalized metric rows — one per date
  const normalizedRows: NormalizedMetric[] = [];

  for (const [date, count] of dailyCounts) {
    normalizedRows.push({
      date,
      tenantId,
      campaignId,
      source: 'ga4',
      // GA4 is a lead-gen outcome source — no spend, impressions, or clicks
      spendUsd: undefined,
      impressions: undefined,
      clicks: undefined,
      ctr: undefined,
      cpm: undefined,
      // RESEARCH.md Pattern 10: lead counts go in directConversions for lead-gen tenants
      directRevenue: undefined,
      directConversions: String(count),
      directRoas: undefined,
    });
  }

  // Upsert into campaign_metrics with 4-column conflict target
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
// Top-level orchestrator
// ---------------------------------------------------------------------------

interface ProcessGA4SyncParams {
  tenantId: string;
  integrationId: string;
  dateRange: { start: string; end: string };
}

interface ProcessGA4SyncResult {
  recordsIngested: number;
  datesProcessed: number;
}

/**
 * Top-level orchestrator for a GA4 sync run.
 *
 * Orchestration order (two-stage pipeline per RESEARCH.md):
 *   1. Load integration record, decrypt tokens
 *   2. Read selectedEventNames + propertyId from integration.metadata
 *   3. Refresh token if close to expiry
 *   4. Update integration if token was refreshed
 *   5. Ensure synthetic "ga4-leads" campaign exists
 *   6. Call fetchLeadCounts for date range (one request — RESEARCH.md Pitfall 2)
 *   7. Stage 1: Store raw GA4 response in raw_api_pulls
 *   8. Stage 2: Upsert normalized lead counts into campaign_metrics
 *   9. Update ingestion_coverage for each date in the range
 *
 * All DB operations use withTenant() for RLS context.
 *
 * @returns Summary with count of date-rows ingested and unique dates processed
 */
export async function processGA4Sync(
  params: ProcessGA4SyncParams,
): Promise<ProcessGA4SyncResult> {
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
    throw new Error(`No access token found for GA4 integration ${integrationId}`);
  }

  const metadata = (integration.metadata ?? {}) as Record<string, unknown>;
  const accessToken = decryptToken(integration.encryptedAccessToken);
  const refreshToken = integration.encryptedRefreshToken
    ? decryptToken(integration.encryptedRefreshToken)
    : undefined;

  // Step 2: Read selectedEventNames and propertyId from metadata
  const selectedEventNames = (metadata.selectedEventNames as string[] | undefined) ?? [];
  const propertyId = metadata.propertyId as string | undefined;

  if (!propertyId) {
    throw new Error(
      `GA4 integration ${integrationId} missing propertyId in metadata. ` +
      `User must complete property selection step.`,
    );
  }

  if (selectedEventNames.length === 0) {
    // No events selected — nothing to sync
    return { recordsIngested: 0, datesProcessed: 0 };
  }

  // Step 3: Refresh token if close to expiry
  const connector = new GA4Connector();
  const tokenExpiresAt = metadata.tokenExpiresAt as string | number | undefined;

  let currentAccessToken = accessToken;
  let newTokenExpiresAt: Date | undefined;

  if (refreshToken) {
    const refreshResult = await connector.refreshTokenIfNeeded(
      accessToken,
      refreshToken,
      tokenExpiresAt,
    );
    currentAccessToken = refreshResult.accessToken;
    newTokenExpiresAt = refreshResult.tokenExpiresAt;
  }

  // Step 4: Update integration if token was refreshed
  if (newTokenExpiresAt && currentAccessToken !== accessToken) {
    const { encryptToken } = await import('../crypto');
    await withTenant(tenantId, (tx) =>
      tx.update(integrations)
        .set({
          encryptedAccessToken: encryptToken(currentAccessToken),
          tokenExpiresAt: newTokenExpiresAt,
          metadata: {
            ...metadata,
            tokenExpiresAt: newTokenExpiresAt!.toISOString(),
          },
        })
        .where(eq(integrations.id, integrationId))
    );
  }

  // Step 5: Ensure synthetic "ga4-leads" campaign exists
  const campaignId = await ensureGA4SyntheticCampaign(tenantId);

  // Step 6: Fetch lead counts from GA4 Data API
  // Single request for all selected events (RESEARCH.md Pitfall 2)
  const dailyCounts = await connector.fetchLeadCounts(
    currentAccessToken,
    propertyId,
    selectedEventNames,
    dateRange,
    refreshToken,
  );

  // Convert Map to plain object for JSON serialization in raw_api_pulls
  const dailyCountsObject: Record<string, number> = {};
  for (const [date, count] of dailyCounts) {
    dailyCountsObject[date] = count;
  }

  // Step 7: Store raw pull in raw_api_pulls (Stage 1)
  const rawPullId = await storeGA4RawPull({
    tenantId,
    apiParams: {
      dateRange,
      integrationId,
      propertyId,
      selectedEventNames,
      apiVersion: 'data-v1beta',
    },
    payload: dailyCountsObject,
  });

  // Step 8: Normalize into campaign_metrics (Stage 2)
  const recordsIngested = await normalizeGA4Events({
    tenantId,
    rawPullId,
    dailyCounts,
    campaignId,
  });

  // Step 9: Update ingestion_coverage for each date in the range
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
        source: 'ga4',
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
