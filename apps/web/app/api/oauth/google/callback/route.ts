import { NextRequest, NextResponse } from 'next/server';
import { verifyState, saveIntegration } from '@/lib/oauth-helpers';

/**
 * GET /api/oauth/google/callback
 *
 * Google Ads OAuth callback handler. Exchanges the authorization code for
 * access + refresh tokens, fetches accessible customer IDs, and persists
 * the encrypted credentials to the integrations table.
 *
 * MCC account note (RESEARCH.md Pitfall 5): If the authorized account is a
 * manager account (MCC), the listAccessibleCustomers response includes a
 * loginCustomerId. Both customerId and loginCustomerId are stored in metadata
 * to prevent USER_PERMISSION_DENIED errors on subsequent API calls.
 *
 * IMPORTANT: Does NOT trigger a backfill here. Backfill is triggered by the
 * scheduler (Plan 06).
 *
 * Required env vars:
 *   GOOGLE_ADS_CLIENT_ID       — Google OAuth client ID
 *   GOOGLE_ADS_CLIENT_SECRET   — Google OAuth client secret
 *   NEXT_PUBLIC_APP_URL        — Base URL for constructing the redirect_uri
 *   OAUTH_STATE_SECRET         — Secret for HMAC state verification
 *   TOKEN_ENCRYPTION_KEY       — 32-byte key as 64 hex chars for AES-256-GCM
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

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json(
      { error: 'Google Ads OAuth is not fully configured' },
      { status: 500 }
    );
  }

  const redirectUri = `${appUrl}/api/oauth/google/callback`;

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

    // Step 2: Fetch accessible Google Ads customer IDs
    // The listAccessibleCustomers endpoint returns all customers the authorized
    // user has access to, including both direct and manager (MCC) accounts.
    const customersRes = await fetch(
      'https://googleads.googleapis.com/v18/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '',
        },
      }
    );

    let customerIds: string[] = [];
    let primaryCustomerId: string | null = null;
    let loginCustomerId: string | null = null;

    if (customersRes.ok) {
      const customersData = await customersRes.json() as {
        resourceNames?: string[];
      };
      // Resource names are formatted as "customers/{customer_id}"
      customerIds = (customersData.resourceNames ?? []).map((name: string) =>
        name.replace('customers/', '')
      );
      if (customerIds.length > 0) {
        primaryCustomerId = customerIds[0];
        // For MCC accounts, loginCustomerId is the manager account ID
        // Store the first accessible customer; if it's an MCC, the caller
        // can iterate customerIds for child accounts
        loginCustomerId = customerIds.length > 1 ? customerIds[0] : null;
      }
    }

    // Step 3: Persist encrypted credentials
    const integration = await saveIntegration({
      tenantId,
      platform: 'google_ads',
      accountId: primaryCustomerId,
      accountName: null, // Account name fetched separately if needed
      accessToken,
      refreshToken,
      tokenExpiresAt,
      metadata: {
        customerId: primaryCustomerId,
        loginCustomerId,
        customerIds,
      },
    });

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      platform: 'google_ads',
      accountId: primaryCustomerId,
      customerIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Google Ads OAuth callback failed', details: message },
      { status: 500 }
    );
  }
}
