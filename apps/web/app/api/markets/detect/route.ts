import { NextRequest, NextResponse } from 'next/server';
import { detectMarketsForTenant } from '@incremental-iq/ingestion';

/**
 * POST /api/markets/detect
 *
 * Triggers the full market detection pipeline for a tenant.
 * Reads geo-targeting metadata from Google Ads and Meta integrations,
 * upserts the results into the markets and campaign_markets tables,
 * and returns the detected/updated markets array.
 *
 * Called:
 *   - During onboarding after ad accounts are connected
 *   - On-demand to re-detect when new campaigns are added
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Returns:
 *   200: DetectedMarket[]
 *   400: { error: string }
 *   500: { error: string, details: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  try {
    const detectedMarkets = await detectMarketsForTenant(tenantId);
    return NextResponse.json(detectedMarkets);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Market detection failed', details: message },
      { status: 500 },
    );
  }
}
