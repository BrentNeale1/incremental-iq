import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { detectMarketsForTenant } from '@incremental-iq/ingestion';

/**
 * POST /api/markets/detect
 *
 * Triggers the full market detection pipeline for a tenant.
 * Reads geo-targeting metadata from Google Ads and Meta integrations,
 * upserts the results into the markets and campaign_markets tables,
 * and returns the detected/updated markets array.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Called:
 *   - During onboarding after ad accounts are connected
 *   - On-demand to re-detect when new campaigns are added
 *
 * Returns:
 *   200: DetectedMarket[]
 *   401: { error: 'Unauthorized' }
 *   500: { error: string, details: string }
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

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
