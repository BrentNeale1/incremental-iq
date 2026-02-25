import { GoogleAdsApi } from 'google-ads-api';

/**
 * Google Ads geo targeting market detection.
 *
 * Uses the two-query GAQL approach (RESEARCH.md Pattern 4):
 *   Query 1: campaign_criterion to get campaign → geo_target_constant mappings
 *   Query 2: geo_target_constant to resolve resource names → country codes
 *
 * RESEARCH.md Pitfall 4: Use country_code from ALL geo constants regardless of
 * target_type. Cities, regions, and postal codes all carry the correct country_code.
 * Do NOT filter by target_type='Country'.
 *
 * RESEARCH.md Pitfall (GAQL no JOINs): Two separate queries are required because
 * GAQL does not support JOINs across resources.
 *
 * Returns Array<{ campaignExternalId, countryCodes }> where countryCodes is an
 * empty array for campaigns with no location targeting (-> Global/Unassigned).
 */

/** A campaign's resolved geo markets from Google Ads targeting. */
export interface GoogleAdsMarketResult {
  campaignExternalId: string;  // Google Ads campaign.id (numeric string)
  countryCodes: string[];       // ISO 3166-1 alpha-2 codes; empty = Global/Unassigned
}

/**
 * Detect markets from Google Ads geo targeting metadata.
 *
 * Creates a temporary Google Ads API customer instance (same pattern as
 * GoogleAdsConnector.createCustomer) to execute the two-query GAQL approach.
 *
 * @param accessToken      Decrypted OAuth refresh token (used as refresh_token)
 * @param customerId       Google Ads customer ID (e.g., '123-456-7890')
 * @param loginCustomerId  MCC manager account ID (may be undefined for direct accounts)
 * @returns Array of campaign external IDs with their detected country codes
 */
export async function detectGoogleAdsMarkets(
  accessToken: string,
  customerId: string,
  loginCustomerId?: string,
): Promise<GoogleAdsMarketResult[]> {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
  });

  const customer = client.Customer({
    customer_id: customerId,
    login_customer_id: loginCustomerId,
    refresh_token: accessToken,
  });

  // ---------------------------------------------------------------------------
  // Query 1: Get campaign → geo_target_constant resource name mappings
  // Only non-negative (positive) location targets are relevant for market detection.
  // ---------------------------------------------------------------------------
  const criterionQuery = `
    SELECT
      campaign.id,
      campaign_criterion.location.geo_target_constant,
      campaign_criterion.negative
    FROM campaign_criterion
    WHERE campaign_criterion.type = 'LOCATION'
      AND campaign_criterion.negative = FALSE
  `;

  let criterionResults: Array<Record<string, unknown>>;
  try {
    criterionResults = await customer.query(criterionQuery);
  } catch (err) {
    // If the query fails (e.g., no location criteria configured), return empty
    console.warn('[market-detection/google-ads] campaign_criterion query failed:', err);
    return [];
  }

  if (criterionResults.length === 0) {
    return [];
  }

  // Build: Map<campaignExternalId, Set<geoResourceName>>
  const campaignToGeoResources = new Map<string, Set<string>>();
  const allGeoResourceNames = new Set<string>();

  for (const row of criterionResults) {
    const campaign = row.campaign as Record<string, unknown> | undefined;
    const criterion = row.campaign_criterion as Record<string, unknown> | undefined;
    const location = criterion?.location as Record<string, unknown> | undefined;
    const geoConstant = location?.geo_target_constant as string | undefined;
    const campaignId = String(campaign?.id ?? '');

    if (!campaignId || !geoConstant) continue;

    if (!campaignToGeoResources.has(campaignId)) {
      campaignToGeoResources.set(campaignId, new Set());
    }
    campaignToGeoResources.get(campaignId)!.add(geoConstant);
    allGeoResourceNames.add(geoConstant);
  }

  if (allGeoResourceNames.size === 0) {
    return [];
  }

  // ---------------------------------------------------------------------------
  // Query 2: Resolve geo_target_constant resource names → country codes
  //
  // RESEARCH.md Pitfall 4: country_code is correct on ALL geo constants
  // (countries, cities, regions, postal codes). Just use country_code directly.
  // ---------------------------------------------------------------------------
  const constants = [...allGeoResourceNames];
  // GAQL IN clause requires single-quoted string literals
  const inClause = constants.map((c) => `'${c}'`).join(', ');

  const geoQuery = `
    SELECT
      geo_target_constant.resource_name,
      geo_target_constant.country_code
    FROM geo_target_constant
    WHERE geo_target_constant.resource_name IN (${inClause})
  `;

  let geoResults: Array<Record<string, unknown>>;
  try {
    geoResults = await customer.query(geoQuery);
  } catch (err) {
    console.warn('[market-detection/google-ads] geo_target_constant query failed:', err);
    return [];
  }

  // Build: Map<resourceName, countryCode>
  const resourceToCountry = new Map<string, string>();
  for (const row of geoResults) {
    const geoConst = row.geo_target_constant as Record<string, unknown> | undefined;
    const resourceName = geoConst?.resource_name as string | undefined;
    const countryCode = geoConst?.country_code as string | undefined;

    if (resourceName && countryCode) {
      resourceToCountry.set(resourceName, countryCode);
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate: campaign → deduplicated Set<countryCode>
  // ---------------------------------------------------------------------------
  const results: GoogleAdsMarketResult[] = [];

  for (const [campaignId, geoResources] of campaignToGeoResources.entries()) {
    const countryCodes = new Set<string>();

    for (const resourceName of geoResources) {
      const countryCode = resourceToCountry.get(resourceName);
      if (countryCode) {
        countryCodes.add(countryCode.toUpperCase());
      }
    }

    results.push({
      campaignExternalId: campaignId,
      countryCodes: [...countryCodes],
    });
  }

  return results;
}
