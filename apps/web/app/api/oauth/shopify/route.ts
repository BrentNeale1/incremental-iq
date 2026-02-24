import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/shopify
 *
 * Initiates the Shopify OAuth flow by redirecting to the shop's authorization
 * page. Requires both tenantId and shop query parameters.
 *
 * Required env vars:
 *   SHOPIFY_API_KEY       — Shopify app API key (client ID)
 *   NEXT_PUBLIC_APP_URL   — Base URL for constructing the redirect_uri
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenantId');
  const shop = searchParams.get('shop');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId query parameter is required' },
      { status: 400 }
    );
  }

  if (!shop) {
    return NextResponse.json(
      { error: 'shop query parameter is required (e.g., mystore.myshopify.com)' },
      { status: 400 }
    );
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'SHOPIFY_API_KEY is not configured' },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL is not configured' },
      { status: 500 }
    );
  }

  const state = generateState(tenantId);
  const redirectUri = `${appUrl}/api/oauth/shopify/callback`;

  // Normalize shop domain — ensure it ends with .myshopify.com
  const shopDomain = shop.includes('.') ? shop : `${shop}.myshopify.com`;

  const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', apiKey);
  authUrl.searchParams.set('scope', 'read_orders,read_all_orders');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
