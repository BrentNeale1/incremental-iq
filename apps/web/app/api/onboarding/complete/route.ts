import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { db, tenants } from '@incremental-iq/db';
import { eq } from 'drizzle-orm';

/**
 * POST /api/onboarding/complete
 *
 * Marks the authenticated tenant's onboarding as complete.
 * Called by the wizard when the user clicks "Complete Setup" on the final step.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Does NOT use withTenant — the tenants table has no RLS (root of isolation
 * hierarchy). Access is controlled by application-level auth.
 *
 * Returns:
 *   200: { success: true }
 *   401: { error: 'Unauthorized' }
 */
export async function POST(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  try {
    await db
      .update(tenants)
      .set({
        onboardingCompleted: true,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to complete onboarding', details: message },
      { status: 500 },
    );
  }
}
