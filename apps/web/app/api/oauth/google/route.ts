import { NextRequest, NextResponse } from 'next/server';
import { generateState } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/google
 *
 * Initiates the Google Ads OAuth flow by redirecting to the Google
 * authorization server. Requests offline access so a refresh token is
 * returned — required for server-side API calls after initial authorization.
 *
 * Required env vars:
 *   GOOGLE_ADS_CLIENT_ID  — Google OAuth client ID
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

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_ADS_CLIENT_ID is not configured' },
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
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/adwords');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // Force consent to always get refresh_token

  return NextResponse.redirect(authUrl.toString());
}
