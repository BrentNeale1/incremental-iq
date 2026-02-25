import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { db, withTenant, tenants, integrations, markets } from '@incremental-iq/db';
import { eq, sql } from 'drizzle-orm';

/**
 * GET /api/onboarding/status
 *
 * Returns the current onboarding progress for the authenticated tenant.
 * The wizard uses this endpoint to resume where the user left off.
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Returns:
 *   200: OnboardingStatus
 *   401: { error: 'Unauthorized' }
 *
 * Response shape:
 *   {
 *     completed: boolean,
 *     connectedPlatforms: string[],
 *     ga4EventsSelected: boolean,
 *     marketsConfirmed: boolean,
 *     outcomeMode: string,
 *     suggestedStep: 1 | 2 | 3 | 4,
 *   }
 *
 * Suggested step logic:
 *   1 — no integrations connected
 *   2 — GA4 is connected but events not yet selected
 *   3 — markets not confirmed
 *   4 — all done (wizard can show completion / complete button)
 */

interface OnboardingStatus {
  completed: boolean;
  connectedPlatforms: string[];
  ga4EventsSelected: boolean;
  marketsConfirmed: boolean;
  outcomeMode: string;
  suggestedStep: 1 | 2 | 3 | 4;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  try {
    // Query tenants table (no RLS — root of isolation hierarchy)
    const tenantRows = await db
      .select({
        onboardingCompleted: tenants.onboardingCompleted,
        outcomeMode: tenants.outcomeMode,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const tenant = tenantRows[0];
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    // Query integrations (RLS-gated — use withTenant)
    const integrationRows: { platform: string; metadata: unknown }[] = await withTenant(
      tenantId,
      (tx) =>
        tx
          .select({ platform: integrations.platform, metadata: integrations.metadata })
          .from(integrations)
          .where(eq(integrations.tenantId, tenantId)),
    );

    const connectedPlatforms = integrationRows.map((r) => r.platform);

    // Check if GA4 has selectedEventNames in metadata
    const ga4Integration = integrationRows.find((r) => r.platform === 'ga4');
    let ga4EventsSelected = false;
    if (ga4Integration) {
      const meta = ga4Integration.metadata as Record<string, unknown> | null;
      const selectedEventNames = meta?.selectedEventNames;
      ga4EventsSelected =
        Array.isArray(selectedEventNames) && selectedEventNames.length > 0;
    }

    // Check if any markets have isConfirmed=true (RLS-gated — use withTenant)
    const confirmedMarketRows: { count: number }[] = await withTenant(
      tenantId,
      (tx) =>
        tx
          .select({ count: sql<number>`count(*)::int` })
          .from(markets)
          .where(
            sql`${markets.tenantId} = ${tenantId}::uuid AND ${markets.isConfirmed} = true`,
          ),
    );

    const marketsConfirmed = (confirmedMarketRows[0]?.count ?? 0) > 0;

    // Derive suggested step
    let suggestedStep: 1 | 2 | 3 | 4;
    if (connectedPlatforms.length === 0) {
      suggestedStep = 1;
    } else if (connectedPlatforms.includes('ga4') && !ga4EventsSelected) {
      suggestedStep = 2;
    } else if (!marketsConfirmed) {
      suggestedStep = 3;
    } else {
      suggestedStep = 4;
    }

    const status: OnboardingStatus = {
      completed: tenant.onboardingCompleted,
      connectedPlatforms,
      ga4EventsSelected,
      marketsConfirmed,
      outcomeMode: tenant.outcomeMode,
      suggestedStep,
    };

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch onboarding status', details: message },
      { status: 500 },
    );
  }
}
