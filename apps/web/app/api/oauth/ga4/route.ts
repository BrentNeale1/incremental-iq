import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/ga4
 *
 * Initiates the Google Analytics 4 OAuth flow by redirecting to the Google
 * authorization server. Requests analytics.readonly scope (NOT analytics.edit —
 * RESEARCH.md State of the Art) and offline access for refresh token.
 *
 * GA4 OAuth is SEPARATE from Google Ads OAuth (RESEARCH.md Pattern 1):
 *   - Different scope: analytics.readonly vs adwords
 *   - User may authorize from a different Google account
 *   - Does NOT use a developer token (GA4 Admin API does not require one)
 *
 * Required env vars:
 *   GA4_CLIENT_ID         — Google OAuth client ID (may be same project as Google Ads)
 *   NEXT_PUBLIC_APP_URL   — Base URL for constructing the redirect_uri
 *
 * @param request - Requires `?tenantId=` query parameter
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

  const clientId = process.env.GA4_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GA4_CLIENT_ID is not configured' },
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
  const redirectUri = `${appUrl}/api/oauth/ga4/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  // RESEARCH.md State of the Art: analytics.readonly — never request analytics.edit
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/analytics.readonly');
  authUrl.searchParams.set('access_type', 'offline');
  // prompt: 'consent' required to receive refresh_token on every authorization
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(authUrl.toString());
}
