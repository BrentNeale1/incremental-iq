import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db, withTenant, markets, campaignMarkets, campaigns, integrations } from '@incremental-iq/db';
import { decryptToken } from '../crypto';
import { detectGoogleAdsMarkets } from './google-ads';
import { detectMetaMarkets } from './meta';

/**
 * Market detection orchestrator — detectMarketsForTenant.
 *
 * Reads all active integrations for a tenant, calls platform-specific
 * detection functions to extract country codes from geo targeting metadata,
 * then upserts the results into the markets and campaign_markets tables.
 *
 * Flow:
 *   1. Fetch all google_ads and meta integrations for tenantId
 *   2. Decrypt tokens and call detectGoogleAdsMarkets / detectMetaMarkets
 *   3. Aggregate country codes across all integrations
 *   4. For each unique country: upsert into markets with Intl.DisplayNames name
 *   5. For each campaign: upsert into campaign_markets with source='auto_detected'
 *   6. Campaigns with empty countryCodes → marketId=NULL (Global/Unassigned)
 *
 * All DB operations use withTenant() for RLS context.
 *
 * @param tenantId  UUID of the tenant to run market detection for
 * @returns Array of the created/updated market rows
 */

/** Shape of a market row returned by detectMarketsForTenant */
export interface DetectedMarket {
  id: string;
  countryCode: string;
  displayName: string;
  campaignCount: number;
  isConfirmed: boolean;
}

/** Minimal integration row shape used for market detection */
interface IntegrationRow {
  id: string;
  platform: string;
  status: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  metadata: unknown;
}

/** Intl.DisplayNames instance for zero-dependency country name lookup */
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * Resolve a country code to a human-readable display name.
 * Falls back to the country code itself if Intl.DisplayNames doesn't know it.
 */
function getCountryDisplayName(countryCode: string): string {
  try {
    return regionNames.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

export async function detectMarketsForTenant(tenantId: string): Promise<DetectedMarket[]> {
  // ---------------------------------------------------------------------------
  // Step 1: Fetch all relevant integrations for this tenant
  // ---------------------------------------------------------------------------
  const allIntegrations = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.tenantId, tenantId),
        eq(integrations.status, 'connected'),
      ),
    );

  const googleAdsIntegrations = (allIntegrations as IntegrationRow[]).filter(
    (i) => i.platform === 'google_ads',
  );
  const metaIntegrations = (allIntegrations as IntegrationRow[]).filter(
    (i) => i.platform === 'meta',
  );

  // ---------------------------------------------------------------------------
  // Step 2: Detect markets from each integration
  // campaignResults: Array<{ campaignExternalId: string, countryCodes: string[] }>
  // ---------------------------------------------------------------------------
  const allCampaignResults: Array<{ campaignExternalId: string; countryCodes: string[] }> = [];

  for (const integration of googleAdsIntegrations) {
    if (!integration.encryptedAccessToken && !integration.encryptedRefreshToken) continue;

    const metadata = integration.metadata as Record<string, unknown> | null ?? {};
    const customerId = metadata.customerId as string | undefined;
    const loginCustomerId = metadata.loginCustomerId as string | undefined;

    if (!customerId) {
      console.warn(
        `[market-detection] Google Ads integration ${integration.id} has no customerId in metadata — skipping`,
      );
      continue;
    }

    try {
      // Use refresh token if available (preferred for Google OAuth), else access token
      const token = integration.encryptedRefreshToken
        ? decryptToken(integration.encryptedRefreshToken)
        : decryptToken(integration.encryptedAccessToken!);

      const results = await detectGoogleAdsMarkets(token, customerId, loginCustomerId);
      allCampaignResults.push(...results);
    } catch (err) {
      console.warn(
        `[market-detection] Google Ads integration ${integration.id} failed:`,
        err,
      );
    }
  }

  for (const integration of metaIntegrations) {
    if (!integration.encryptedAccessToken) continue;

    const metadata = integration.metadata as Record<string, unknown> | null ?? {};
    const adAccountId = metadata.adAccountId as string | undefined;

    if (!adAccountId) {
      console.warn(
        `[market-detection] Meta integration ${integration.id} has no adAccountId in metadata — skipping`,
      );
      continue;
    }

    try {
      const accessToken = decryptToken(integration.encryptedAccessToken);
      const results = await detectMetaMarkets(accessToken, adAccountId);
      allCampaignResults.push(...results);
    } catch (err) {
      console.warn(
        `[market-detection] Meta integration ${integration.id} failed:`,
        err,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3: Build country → campaign count mapping
  // Also build a flat list of all campaign external IDs with their country codes
  // ---------------------------------------------------------------------------
  const countryToCampaignIds = new Map<string, Set<string>>();

  for (const result of allCampaignResults) {
    for (const code of result.countryCodes) {
      if (!countryToCampaignIds.has(code)) {
        countryToCampaignIds.set(code, new Set());
      }
      countryToCampaignIds.get(code)!.add(result.campaignExternalId);
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: Resolve campaign external IDs to internal UUIDs
  // ---------------------------------------------------------------------------
  // Fetch all campaigns for this tenant to build externalId -> UUID map
  const tenantCampaigns: Array<{ id: string; externalId: string }> = await withTenant(tenantId, (tx) =>
    tx.select({ id: campaigns.id, externalId: campaigns.externalId })
      .from(campaigns)
      .where(eq(campaigns.tenantId, tenantId))
  );

  const externalIdToUuid = new Map(
    tenantCampaigns.map((c) => [c.externalId, c.id]),
  );

  // ---------------------------------------------------------------------------
  // Step 5: Upsert markets for each unique country code
  // ---------------------------------------------------------------------------
  const upsertedMarkets: DetectedMarket[] = [];

  await withTenant(tenantId, async (tx) => {
    for (const [countryCode, campaignExternalIds] of countryToCampaignIds.entries()) {
      const displayName = getCountryDisplayName(countryCode);
      const campaignCount = campaignExternalIds.size;

      // Check if market already exists for this tenant + countryCode
      const existing = await tx
        .select()
        .from(markets)
        .where(
          and(
            eq(markets.tenantId, tenantId),
            eq(markets.countryCode, countryCode),
          ),
        )
        .limit(1);

      let marketId: string;

      if (existing.length === 0) {
        // Insert new market
        const [inserted] = await tx
          .insert(markets)
          .values({
            tenantId,
            countryCode,
            displayName,
            campaignCount,
            isConfirmed: false,
          })
          .returning();

        marketId = inserted.id;
        upsertedMarkets.push({
          id: inserted.id,
          countryCode: inserted.countryCode,
          displayName: inserted.displayName,
          campaignCount: inserted.campaignCount,
          isConfirmed: inserted.isConfirmed,
        });
      } else {
        // Update campaignCount on existing market (displayName left unchanged — user may have edited it)
        await tx
          .update(markets)
          .set({ campaignCount })
          .where(eq(markets.id, existing[0].id));

        marketId = existing[0].id;
        upsertedMarkets.push({
          id: existing[0].id,
          countryCode: existing[0].countryCode,
          displayName: existing[0].displayName,
          campaignCount,
          isConfirmed: existing[0].isConfirmed,
        });
      }

      // ---------------------------------------------------------------------------
      // Step 6: Upsert campaign_markets for each campaign in this market
      // ---------------------------------------------------------------------------
      for (const externalId of campaignExternalIds) {
        const campaignUuid = externalIdToUuid.get(externalId);
        if (!campaignUuid) continue; // campaign not yet synced — skip

        // Use raw SQL upsert: insert or update on conflict (tenantId, campaignId)
        await tx.execute(sql`
          INSERT INTO campaign_markets (id, tenant_id, campaign_id, market_id, source)
          VALUES (
            gen_random_uuid(),
            ${tenantId}::uuid,
            ${campaignUuid}::uuid,
            ${marketId}::uuid,
            'auto_detected'
          )
          ON CONFLICT (tenant_id, campaign_id)
          DO UPDATE SET
            market_id = EXCLUDED.market_id,
            source = 'auto_detected'
        `);
      }
    }

    // ---------------------------------------------------------------------------
    // Step 7: Insert campaign_markets with NULL marketId for unassigned campaigns
    // Campaigns in allCampaignResults with empty countryCodes -> Global/Unassigned
    // ---------------------------------------------------------------------------
    for (const result of allCampaignResults) {
      if (result.countryCodes.length > 0) continue; // already handled above

      const campaignUuid = externalIdToUuid.get(result.campaignExternalId);
      if (!campaignUuid) continue;

      await tx.execute(sql`
        INSERT INTO campaign_markets (id, tenant_id, campaign_id, market_id, source)
        VALUES (
          gen_random_uuid(),
          ${tenantId}::uuid,
          ${campaignUuid}::uuid,
          NULL,
          'auto_detected'
        )
        ON CONFLICT (tenant_id, campaign_id)
        DO UPDATE SET
          market_id = NULL,
          source = 'auto_detected'
      `);
    }
  });

  return upsertedMarkets;
}
