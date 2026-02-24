import { NextRequest, NextResponse } from 'next/server';
import { verifyState, saveIntegration } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/meta/callback
 *
 * Meta OAuth callback handler. Receives the authorization code from Meta,
 * exchanges it for a short-lived token, then exchanges that for a long-lived
 * token (60-day expiry), fetches the ad account ID, and persists the
 * encrypted credentials to the integrations table.
 *
 * IMPORTANT: Does NOT trigger a backfill here. Backfill is triggered by the
 * scheduler (Plan 06) — triggering HTTP-handler-side backfills is an
 * anti-pattern noted in RESEARCH.md.
 *
 * Required env vars:
 *   FACEBOOK_APP_ID       — Meta app client ID
 *   FACEBOOK_APP_SECRET   — Meta app client secret
 *   NEXT_PUBLIC_APP_URL   — Base URL for constructing the redirect_uri
 *   OAUTH_STATE_SECRET    — Secret for HMAC state verification
 *   TOKEN_ENCRYPTION_KEY  — 32-byte key as 64 hex chars for AES-256-GCM
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // Handle user denial
  if (errorParam) {
    return NextResponse.json(
      { error: 'OAuth authorization denied', details: errorParam },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing code or state parameter' },
      { status: 400 }
    );
  }

  // Verify CSRF state
  let tenantId: string;
  try {
    ({ tenantId } = verifyState(state));
  } catch {
    return NextResponse.json(
      { error: 'Invalid state parameter' },
      { status: 403 }
    );
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appId || !appSecret || !appUrl) {
    return NextResponse.json(
      { error: 'Meta OAuth is not fully configured' },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/meta/callback`;

  try {
    // Step 1: Exchange code for short-lived token
    const tokenUrl = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenRes = await fetch(tokenUrl.toString());
    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.json(
        { error: 'Failed to exchange code for token', details: err },
        { status: 502 }
      );
    }
    const tokenData = await tokenRes.json() as { access_token: string };
    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange short-lived token for long-lived token (60-day expiry)
    const longLivedUrl = new URL('https://graph.facebook.com/v23.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedRes = await fetch(longLivedUrl.toString());
    if (!longLivedRes.ok) {
      const err = await longLivedRes.text();
      return NextResponse.json(
        { error: 'Failed to exchange for long-lived token', details: err },
        { status: 502 }
      );
    }
    const longLivedData = await longLivedRes.json() as {
      access_token: string;
      expires_in?: number;
    };
    const accessToken = longLivedData.access_token;
    // Meta long-lived tokens expire in ~60 days (5184000 seconds)
    const expiresIn = longLivedData.expires_in ?? 5184000;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Step 3: Fetch ad accounts linked to this user
    const adAccountsUrl = new URL('https://graph.facebook.com/v23.0/me/adaccounts');
    adAccountsUrl.searchParams.set('access_token', accessToken);
    adAccountsUrl.searchParams.set('fields', 'id,name');

    const adAccountsRes = await fetch(adAccountsUrl.toString());
    let adAccountId: string | null = null;
    let adAccountName: string | null = null;
    let adAccountsMetadata: Array<{ id: string; name: string }> = [];

    if (adAccountsRes.ok) {
      const adAccountsData = await adAccountsRes.json() as {
        data: Array<{ id: string; name: string }>;
      };
      adAccountsMetadata = adAccountsData.data ?? [];
      // Use the first ad account as primary
      if (adAccountsMetadata.length > 0) {
        adAccountId = adAccountsMetadata[0].id;
        adAccountName = adAccountsMetadata[0].name;
      }
    }

    // Step 4: Persist encrypted credentials
    const integration = await saveIntegration({
      tenantId,
      platform: 'meta',
      accountId: adAccountId,
      accountName: adAccountName,
      accessToken,
      refreshToken: null, // Meta uses long-lived tokens, no refresh token
      tokenExpiresAt,
      metadata: {
        adAccountId,
        adAccounts: adAccountsMetadata,
      },
    });

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      platform: 'meta',
      accountId: adAccountId,
      accountName: adAccountName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Meta OAuth callback failed', details: message },
      { status: 500 }
    );
  }
}
