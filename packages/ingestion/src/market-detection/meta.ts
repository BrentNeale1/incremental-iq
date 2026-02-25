/**
 * Meta Ads geo targeting market detection.
 *
 * Uses RESEARCH.md Pattern 5: Meta stores targeting at the ad set level,
 * NOT the campaign level. Campaign geo is inferred by aggregating the
 * targeting.geo_locations.countries array across all ad sets within a campaign.
 *
 * RESEARCH.md Pitfall 3: DO NOT query Campaign object for geo — it does not
 * expose geo targeting. Always query AdSet objects.
 *
 * Ad sets with no geo_locations.countries (e.g., city/region targeting only)
 * produce an empty countries array, which causes the campaign to land in the
 * Global/Unassigned bucket (NULL marketId).
 *
 * Returns Array<{ campaignExternalId, countryCodes }> where countryCodes is an
 * empty array for campaigns with no country-level geo targeting.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const adsSdk = require('facebook-nodejs-business-sdk') as {
  FacebookAdsApi: {
    init: (token: string) => void;
  };
  AdAccount: new (id: string) => MetaAdAccount;
  AdSet: { Fields: Record<string, string> };
};

/** Internal type for Meta AdAccount SDK object */
interface MetaAdAccount {
  getAdSets(fields: string[], params: Record<string, unknown>): Promise<MetaAdSetObject[]>;
}

/** Minimal shape of a Meta AdSet object returned by the SDK */
interface MetaAdSetObject {
  [key: string]: unknown;
}

const { FacebookAdsApi, AdAccount, AdSet } = adsSdk;

/** A campaign's resolved geo markets from Meta ad set targeting. */
export interface MetaMarketResult {
  campaignExternalId: string;  // Meta campaign ID (numeric string)
  countryCodes: string[];       // ISO 3166-1 alpha-2 codes; empty = Global/Unassigned
}

/**
 * Detect markets from Meta ad set geo targeting metadata.
 *
 * Fetches all ad sets for an ad account with their targeting field, then
 * aggregates the geo_locations.countries arrays up to the campaign level.
 * The campaign's market set is the union of all its ad sets' country codes.
 *
 * @param accessToken  Decrypted Meta access token (long-lived token)
 * @param adAccountId  Meta ad account ID (without 'act_' prefix)
 * @returns Array of campaign external IDs with their detected country codes
 */
export async function detectMetaMarkets(
  accessToken: string,
  adAccountId: string,
): Promise<MetaMarketResult[]> {
  FacebookAdsApi.init(accessToken);
  const account = new AdAccount(`act_${adAccountId}`);

  // Fetch all ad sets with targeting field (source of geo targeting on Meta)
  // Use limit: 500 to minimize pagination for typical accounts
  let adSets: MetaAdSetObject[];
  try {
    adSets = await account.getAdSets(
      [AdSet.Fields.id, AdSet.Fields.campaign_id, 'targeting'],
      { limit: 500 },
    );
  } catch (err) {
    console.warn('[market-detection/meta] getAdSets failed:', err);
    return [];
  }

  // Build: Map<campaignExternalId, Set<countryCode>>
  // Union of all ad sets' country codes per campaign
  const campaignToCountries = new Map<string, Set<string>>();

  for (const adSet of adSets) {
    const campaignId = adSet[AdSet.Fields.campaign_id] as string | undefined;
    if (!campaignId) continue;

    if (!campaignToCountries.has(campaignId)) {
      campaignToCountries.set(campaignId, new Set());
    }

    // Extract countries from targeting.geo_locations.countries
    // Meta returns ISO 2-letter codes directly (e.g., ['AU', 'US'])
    const targeting = adSet.targeting as Record<string, unknown> | undefined;
    const geoLocations = targeting?.geo_locations as Record<string, unknown> | undefined;
    const countries = (geoLocations?.countries as string[] | undefined) ?? [];

    for (const code of countries) {
      if (code && typeof code === 'string') {
        campaignToCountries.get(campaignId)!.add(code.toUpperCase());
      }
    }
  }

  // Convert to result array
  return [...campaignToCountries.entries()].map(([campaignExternalId, countryCodes]) => ({
    campaignExternalId,
    countryCodes: [...countryCodes],
  }));
}
