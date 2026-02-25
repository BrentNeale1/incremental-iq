import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { eq } from 'drizzle-orm';
import { withTenant, tenants } from '@incremental-iq/db';

/**
 * GET /api/tenant/preferences
 *
 * Returns tenant preferences including outcome mode.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Returns:
 *   200: { outcomeMode: 'ecommerce' | 'lead_gen' }
 *   401: { error: 'Unauthorized' }
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

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
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Request body:
 *   { outcomeMode: 'ecommerce' | 'lead_gen' }
 *
 * Returns:
 *   200: { outcomeMode: string }
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  let body: { outcomeMode: string };

  try {
    body = (await request.json()) as { outcomeMode: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { outcomeMode } = body;

  if (!['ecommerce', 'lead_gen'].includes(outcomeMode)) {
    return NextResponse.json(
      { error: 'outcomeMode must be ecommerce or lead_gen' },
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
