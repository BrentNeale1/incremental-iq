import { NextRequest, NextResponse } from 'next/server';
import { generateRecommendations } from '@/lib/recommendations/engine';

/**
 * GET /api/recommendations
 *
 * Returns scaling-first recommendations for all campaigns belonging to a tenant,
 * ranked by expected incremental revenue (highest first).
 *
 * Recommendation types:
 *   scale_up   — high/medium confidence + headroom available; includes specific budget numbers
 *   watch      — low confidence; primary path is "wait", secondary path offers holdout test
 *   investigate — insufficient data; no estimate possible
 *
 * RECC-06: holdoutTestDesign is only present on watch/low-confidence recommendations.
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Returns:
 *   200: Recommendation[] sorted by expectedImpact DESC
 *   400: { error: 'Missing tenantId query parameter' }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const marketId = searchParams.get('marketId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing tenantId query parameter' },
      { status: 400 },
    );
  }

  const recommendations = await generateRecommendations(tenantId, marketId);

  return NextResponse.json(recommendations);
}
