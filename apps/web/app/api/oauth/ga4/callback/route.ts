import { NextRequest, NextResponse } from 'next/server';
import { verifyState, saveIntegration } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/ga4/callback
 *
 * Google Analytics 4 OAuth callback handler. Exchanges the authorization code
 * for access + refresh tokens and persists encrypted credentials.
 *
 * Post-callback flow (RESEARCH.md Pitfall 5):
 *   After saving the integration, the client must:
 *   1. Call GET /api/ga4/properties?integrationId= to list available properties
 *   2. User selects a property (or it is auto-selected if only one exists)
 *   3. Call GET /api/ga4/events?integrationId=&propertyId= to list key events
 *   4. User selects which events count as leads
 *   5. Call POST /api/ga4/events to save selections
 *
 * IMPORTANT: Does NOT trigger a backfill here. Backfill is triggered after
 * property + event selection is complete (no backfill with empty event selection).
 *
 * Required env vars:
 *   GA4_CLIENT_ID         — Google OAuth client ID
 *   GA4_CLIENT_SECRET     — Google OAuth client secret
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

  const clientId = process.env.GA4_CLIENT_ID;
  const clientSecret = process.env.GA4_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json(
      { error: 'GA4 OAuth is not fully configured' },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/ga4/callback`;

  try {
    // Step 1: Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.json(
        { error: 'Failed to exchange code for tokens', details: err },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type: string;
    };

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token ?? null;
    const expiresIn = tokenData.expires_in ?? 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Step 2: Persist encrypted credentials with platform='ga4'
    // selectedEventNames is empty initially — user selects events in the next step
    // propertyId is null initially — user selects property in the next step
    const integration = await saveIntegration({
      tenantId,
      platform: 'ga4',
      accountId: null,         // no accountId for GA4 — propertyId set after property selection
      accountName: null,       // populated after property selection
      accessToken,
      refreshToken,
      tokenExpiresAt,
      metadata: {
        selectedEventNames: [],  // populated after event selection
        propertyId: null,        // populated after property selection
        tokenExpiresAt: tokenExpiresAt.toISOString(),
      },
    });

    // Return HTML that closes the popup and notifies the opener via postMessage.
    // Includes integrationId so the wizard can proceed to property selection.
    // Error responses remain as JSON (acceptable in popup — user sees error message).
    // No backfill triggered here — requires property + event selection first.
    const successHtml = `<!DOCTYPE html>
<html>
<head><title>Connected</title></head>
<body>
<script>
  (function() {
    var data = ${JSON.stringify({
      type: 'oauth_complete',
      platform: 'ga4',
      integrationId: integration.id,
      success: true,
    })};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(data, window.location.origin);
    }
    window.close();
  })();
</script>
<p>Connected successfully. You can close this window.</p>
</body>
</html>`;

    return new NextResponse(successHtml, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'GA4 OAuth callback failed', details: message },
      { status: 500 }
    );
  }
}
