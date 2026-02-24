import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/meta
 *
 * Initiates the Meta Ads OAuth flow by redirecting to the Facebook
 * authorization dialog. Requires a tenantId query parameter.
 *
 * Required env vars:
 *   FACEBOOK_APP_ID       — Meta app client ID
 *   NEXT_PUBLIC_APP_URL   — Base URL for constructing the redirect_uri
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'tenantId query parameter is required' },
      { status: 400 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: 'FACEBOOK_APP_ID is not configured' },
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
  const redirectUri = `${appUrl}/api/oauth/meta/callback`;

  const authUrl = new URL('https://www.facebook.com/v23.0/dialog/oauth');
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'ads_read,ads_management');

  return NextResponse.redirect(authUrl.toString());
}
