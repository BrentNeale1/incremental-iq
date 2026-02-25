import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withTenant, integrations } from '@incremental-iq/db';
import { decryptToken } from '@incremental-iq/ingestion';
import { GA4Connector } from '@incremental-iq/ingestion';

/**
 * GET /api/ga4/properties
 *
 * Lists all GA4 properties the authorized user has access to.
 * Called after GA4 OAuth callback to let the user select which property to track.
 *
 * RESEARCH.md Pitfall 5: if only one property exists, include autoSelected: true
 * so the client can skip the property selection step.
 *
 * Query params:
 *   integrationId  — UUID of the GA4 integration (returned from OAuth callback)
 *
 * Headers:
 *   X-Tenant-Id    — Tenant ID for RLS context
 *
 * Returns:
 *   200: { properties: Array<{ propertyId, displayName }>, autoSelected: boolean }
 *   400: Missing params
 *   404: Integration not found
 *   500: Server error
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing X-Tenant-Id header' },
      { status: 400 }
    );
  }

  const { searchParams } = request.nextUrl;
  const integrationId = searchParams.get('integrationId');

  if (!integrationId) {
    return NextResponse.json(
      { error: 'integrationId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Load integration with RLS context
    const rows: { encryptedAccessToken: string | null; encryptedRefreshToken: string | null; metadata: unknown }[] =
      await withTenant(tenantId, (tx) =>
        tx.select({
          encryptedAccessToken: integrations.encryptedAccessToken,
          encryptedRefreshToken: integrations.encryptedRefreshToken,
          metadata: integrations.metadata,
        })
          .from(integrations)
          .where(and(
            eq(integrations.id, integrationId),
            eq(integrations.tenantId, tenantId),
            eq(integrations.platform, 'ga4'),
          ))
          .limit(1)
      );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'GA4 integration not found' },
        { status: 404 }
      );
    }

    const integration = rows[0];

    if (!integration.encryptedAccessToken) {
      return NextResponse.json(
        { error: 'Integration has no access token' },
        { status: 400 }
      );
    }

    const accessToken = decryptToken(integration.encryptedAccessToken);
    const refreshToken = integration.encryptedRefreshToken
      ? decryptToken(integration.encryptedRefreshToken)
      : undefined;

    // Fetch all GA4 properties the user has access to
    const connector = new GA4Connector();
    const properties = await connector.listProperties(accessToken, refreshToken);

    // RESEARCH.md Pitfall 5: if only one property, flag for auto-selection
    const autoSelected = properties.length === 1;

    return NextResponse.json({
      properties,
      autoSelected,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to list GA4 properties', details: message },
      { status: 500 }
    );
  }
}
