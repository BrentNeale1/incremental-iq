import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/auth';
import { generateRecommendations } from '@/lib/recommendations/engine';

/**
 * GET /api/recommendations
 *
 * Returns scaling-first recommendations for all campaigns belonging to a tenant,
 * ranked by expected incremental revenue (highest first).
 *
 * tenantId is extracted from the authenticated session — not from query params.
 * Returns 401 Unauthorized if no valid session exists.
 *
 * Recommendation types:
 *   scale_up   — high/medium confidence + headroom available; includes specific budget numbers
 *   watch      — low confidence; primary path is "wait", secondary path offers holdout test
 *   investigate — insufficient data; no estimate possible
 *
 * RECC-06: holdoutTestDesign is only present on watch/low-confidence recommendations.
 *
 * Query params:
 *   marketId (optional) — filter recommendations by market UUID
 *
 * Returns:
 *   200: Recommendation[] sorted by expectedImpact DESC
 *   401: { error: 'Unauthorized' }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const tenantId = session.user.tenantId;

  const { searchParams } = new URL(request.url);
  const marketId = searchParams.get('marketId');

  const recommendations = await generateRecommendations(tenantId, marketId);

  return NextResponse.json(recommendations);
}
