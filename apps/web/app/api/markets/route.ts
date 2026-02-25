import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant, markets } from '@incremental-iq/db';

/**
 * GET /api/markets
 *
 * Returns all markets for a tenant, ordered by campaignCount DESC.
 * Campaign counts serve as confidence indicators in the onboarding UI —
 * e.g., "AU — 87 campaigns", "US — 243 campaigns".
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Returns:
 *   200: MarketRow[]
 *   401: { error: 'Unauthorized' }
 */

/**
 * PUT /api/markets
 *
 * Batch update markets for a tenant.
 * Supports five actions: confirm, rename, merge, add, delete.
 *
 * Request body: { markets: MarketAction[] }
 *
 * Actions:
 *   confirm — set isConfirmed=true on existing market
 *   rename  — update displayName on existing market
 *   merge   — reassign campaign_markets from source to target, delete source
 *   add     — create new market with isConfirmed=true
 *   delete  — reassign campaigns to NULL (Global/Unassigned), delete market
 *
 * Returns:
 *   200: { markets: MarketRow[] } — updated markets list
 *   400: { error: string }
 *   401: { error: 'Unauthorized' }
 */

/** Shape of a market row returned by the API. */
interface MarketRow {
  id: string;
  countryCode: string;
  displayName: string;
  campaignCount: number;
  isConfirmed: boolean;
  createdAt: string;
}

/** Shape of a single market action in a PUT request. */
interface MarketAction {
  /** Required for confirm, rename, merge (source), delete actions. */
  id?: string;
  /** Required for add, rename, and merge (target via targetId). */
  countryCode?: string;
  displayName?: string;
  /** For merge: the market to merge INTO (campaigns are reassigned to this market). */
  targetId?: string;
  action: 'confirm' | 'rename' | 'merge' | 'add' | 'delete';
}

interface PutBody {
  markets: MarketAction[];
}

/** Query and return markets sorted by campaignCount DESC. */
async function getMarketsForTenant(tenantId: string): Promise<MarketRow[]> {
  const rows: MarketRow[] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: markets.id,
        countryCode: markets.countryCode,
        displayName: markets.displayName,
        campaignCount: markets.campaignCount,
        isConfirmed: markets.isConfirmed,
        createdAt: markets.createdAt,
      })
      .from(markets)
      .where(eq(markets.tenantId, tenantId))
      .orderBy(desc(markets.campaignCount))
  );

  return rows.map((r) => ({
    id: r.id,
    countryCode: r.countryCode,
    displayName: r.displayName,
    campaignCount: r.campaignCount,
    isConfirmed: r.isConfirmed,
    createdAt: r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt),
  }));
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  try {
    const result = await getMarketsForTenant(tenantId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to fetch markets', details: message },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  let body: PutBody;

  try {
    body = (await request.json()) as PutBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { markets: actions } = body;

  if (!Array.isArray(actions) || actions.length === 0) {
    return NextResponse.json(
      { error: 'Request body must include non-empty markets array' },
      { status: 400 },
    );
  }

  try {
    await withTenant(tenantId, async (tx) => {
      for (const action of actions) {
        switch (action.action) {
          // ------------------------------------------------------------------
          // confirm: set isConfirmed=true on existing market row
          // ------------------------------------------------------------------
          case 'confirm': {
            if (!action.id) {
              throw new Error('confirm action requires id');
            }
            await tx
              .update(markets)
              .set({ isConfirmed: true })
              .where(
                and(
                  eq(markets.id, action.id),
                  eq(markets.tenantId, tenantId),
                ),
              );
            break;
          }

          // ------------------------------------------------------------------
          // rename: update displayName on existing market row
          // ------------------------------------------------------------------
          case 'rename': {
            if (!action.id || !action.displayName) {
              throw new Error('rename action requires id and displayName');
            }
            await tx
              .update(markets)
              .set({ displayName: action.displayName })
              .where(
                and(
                  eq(markets.id, action.id),
                  eq(markets.tenantId, tenantId),
                ),
              );
            break;
          }

          // ------------------------------------------------------------------
          // merge: reassign all campaign_markets from source marketId to targetId,
          //        then delete the source market row.
          // action.id = source market (to be deleted)
          // action.targetId = target market (campaigns reassigned here)
          // ------------------------------------------------------------------
          case 'merge': {
            if (!action.id || !action.targetId) {
              throw new Error('merge action requires id (source) and targetId');
            }
            // Reassign campaign_markets from source to target
            await tx.execute(sql`
              UPDATE campaign_markets
              SET market_id = ${action.targetId}::uuid
              WHERE
                tenant_id = ${tenantId}::uuid
                AND market_id = ${action.id}::uuid
            `);
            // Update the target market's campaignCount
            await tx.execute(sql`
              UPDATE markets
              SET campaign_count = (
                SELECT COUNT(*)
                FROM campaign_markets
                WHERE
                  tenant_id = ${tenantId}::uuid
                  AND market_id = ${action.targetId}::uuid
              )
              WHERE
                tenant_id = ${tenantId}::uuid
                AND id = ${action.targetId}::uuid
            `);
            // Delete the source market row
            await tx
              .delete(markets)
              .where(
                and(
                  eq(markets.id, action.id),
                  eq(markets.tenantId, tenantId),
                ),
              );
            break;
          }

          // ------------------------------------------------------------------
          // add: create new market row with isConfirmed=true, campaignCount=0
          // ------------------------------------------------------------------
          case 'add': {
            if (!action.countryCode || !action.displayName) {
              throw new Error('add action requires countryCode and displayName');
            }
            await tx.insert(markets).values({
              tenantId,
              countryCode: action.countryCode.toUpperCase(),
              displayName: action.displayName,
              campaignCount: 0,
              isConfirmed: true,
            });
            break;
          }

          // ------------------------------------------------------------------
          // delete: reassign campaigns to NULL (Global/Unassigned), delete market
          // ------------------------------------------------------------------
          case 'delete': {
            if (!action.id) {
              throw new Error('delete action requires id');
            }
            // Reassign campaign_markets to NULL (Global/Unassigned)
            await tx.execute(sql`
              UPDATE campaign_markets
              SET market_id = NULL
              WHERE
                tenant_id = ${tenantId}::uuid
                AND market_id = ${action.id}::uuid
            `);
            // Delete the market row
            await tx
              .delete(markets)
              .where(
                and(
                  eq(markets.id, action.id),
                  eq(markets.tenantId, tenantId),
                ),
              );
            break;
          }

          default: {
            throw new Error(`Unknown action: ${(action as MarketAction).action}`);
          }
        }
      }
    });

    // Return updated markets list
    const updated = await getMarketsForTenant(tenantId);
    return NextResponse.json({ markets: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to update markets', details: message },
      { status: 500 },
    );
  }
}
