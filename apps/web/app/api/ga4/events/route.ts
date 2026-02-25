import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withTenant, integrations } from '@incremental-iq/db';
import { decryptToken } from '@incremental-iq/ingestion';
import { GA4Connector } from '@incremental-iq/ingestion';

/**
 * GET /api/ga4/events
 *
 * Lists all key events (conversion events) for a selected GA4 property.
 * These are the events the user picks from as their "lead" signals.
 *
 * The GA4 Admin API uses `listKeyEventsAsync` (NOT the deprecated
 * `conversionEvents` endpoint — RESEARCH.md State of the Art).
 *
 * Query params:
 *   integrationId  — UUID of the GA4 integration
 *   propertyId     — GA4 property ID (numeric string, e.g., '123456789')
 *
 * Headers:
 *   X-Tenant-Id    — Tenant ID for RLS context
 *
 * Returns:
 *   200: { events: Array<{ eventName, countingMethod }> }
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
  const propertyId = searchParams.get('propertyId');

  if (!integrationId) {
    return NextResponse.json(
      { error: 'integrationId query parameter is required' },
      { status: 400 }
    );
  }

  if (!propertyId) {
    return NextResponse.json(
      { error: 'propertyId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Load integration with RLS context
    const rows: { encryptedAccessToken: string | null; encryptedRefreshToken: string | null }[] =
      await withTenant(tenantId, (tx) =>
        tx.select({
          encryptedAccessToken: integrations.encryptedAccessToken,
          encryptedRefreshToken: integrations.encryptedRefreshToken,
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

    // Fetch all key events for the selected property
    // Uses listKeyEventsAsync (NOT deprecated conversionEvents — RESEARCH.md State of the Art)
    const connector = new GA4Connector();
    const events = await connector.listKeyEvents(accessToken, propertyId, refreshToken);

    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to list GA4 key events', details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ga4/events
 *
 * Saves the user's event selection and property ID to the integration metadata.
 * Called after the user has reviewed the key event checklist and confirmed their selections.
 *
 * Once selectedEventNames is saved, the GA4 sync worker can start pulling lead counts.
 * If selections change after setup, the full GA4 backfill must be re-triggered
 * (RESEARCH.md Pitfall 7 — changing event selection changes ALL historical data meaning).
 *
 * Request body:
 *   integrationId      — UUID of the GA4 integration
 *   propertyId         — GA4 property ID to track (numeric string)
 *   selectedEventNames — Array of event names to count as leads
 *
 * Headers:
 *   X-Tenant-Id    — Tenant ID for RLS context
 *
 * Returns:
 *   200: { success: true, integrationId, selectedEventNames, propertyId }
 *   400: Missing params or validation error
 *   404: Integration not found
 *   500: Server error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing X-Tenant-Id header' },
      { status: 400 }
    );
  }

  let body: {
    integrationId?: string;
    propertyId?: string;
    selectedEventNames?: string[];
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    );
  }

  const { integrationId, propertyId, selectedEventNames } = body;

  if (!integrationId) {
    return NextResponse.json(
      { error: 'integrationId is required' },
      { status: 400 }
    );
  }

  if (!propertyId) {
    return NextResponse.json(
      { error: 'propertyId is required' },
      { status: 400 }
    );
  }

  if (!Array.isArray(selectedEventNames) || selectedEventNames.length === 0) {
    return NextResponse.json(
      { error: 'selectedEventNames must be a non-empty array of event name strings' },
      { status: 400 }
    );
  }

  try {
    // Load existing integration to merge metadata
    const rows: { id: string; metadata: unknown }[] = await withTenant(tenantId, (tx) =>
      tx.select({
        id: integrations.id,
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

    const existingMetadata = (rows[0].metadata ?? {}) as Record<string, unknown>;

    // Update integration metadata with property and event selections
    await withTenant(tenantId, (tx) =>
      tx.update(integrations)
        .set({
          accountId: propertyId,   // store propertyId as accountId for display
          metadata: {
            ...existingMetadata,
            propertyId,
            selectedEventNames,
          },
        })
        .where(and(
          eq(integrations.id, integrationId),
          eq(integrations.tenantId, tenantId),
        ))
    );

    return NextResponse.json({
      success: true,
      integrationId,
      selectedEventNames,
      propertyId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to save GA4 event selections', details: message },
      { status: 500 }
    );
  }
}
