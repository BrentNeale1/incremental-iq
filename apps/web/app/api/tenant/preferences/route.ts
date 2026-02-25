import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { withTenant, tenants } from '@incremental-iq/db';

/**
 * GET /api/tenant/preferences
 *
 * Returns tenant preferences including outcome mode.
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Returns:
 *   200: { outcomeMode: 'ecommerce' | 'lead_gen' }
 *   400: { error: string }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  try {
    const rows = await withTenant(tenantId, (tx) =>
      tx
        .select({ outcomeMode: tenants.outcomeMode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1),
    );

    const outcomeMode = rows[0]?.outcomeMode ?? 'ecommerce';
    return NextResponse.json({ outcomeMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch preferences', details: message },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/tenant/preferences
 *
 * Update tenant preferences (outcomeMode).
 *
 * Request body:
 *   { tenantId: string, outcomeMode: 'ecommerce' | 'lead_gen' }
 *
 * Returns:
 *   200: { outcomeMode: string }
 *   400: { error: string }
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let body: { tenantId: string; outcomeMode: string };

  try {
    body = (await request.json()) as { tenantId: string; outcomeMode: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantId, outcomeMode } = body;

  if (!tenantId || !['ecommerce', 'lead_gen'].includes(outcomeMode)) {
    return NextResponse.json(
      { error: 'tenantId required, outcomeMode must be ecommerce or lead_gen' },
      { status: 400 },
    );
  }

  try {
    await withTenant(tenantId, (tx) =>
      tx
        .update(tenants)
        .set({ outcomeMode })
        .where(eq(tenants.id, tenantId)),
    );

    return NextResponse.json({ outcomeMode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update preferences', details: message },
      { status: 500 },
    );
  }
}
