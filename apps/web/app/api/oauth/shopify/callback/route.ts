import { NextRequest, NextResponse } from 'next/server';
import { subYears, format } from 'date-fns';
import { verifyState, saveIntegration } from '@/lib/oauth-helpers';
import { enqueueBackfill, registerNightlySync } from '@incremental-iq/ingestion';

/**
 * GET /api/oauth/shopify/callback
 *
 * Shopify OAuth callback handler. Exchanges the authorization code for a
 * permanent access token and persists the encrypted credentials to the
 * integrations table.
 *
 * Shopify access tokens do not expire and there is no refresh token for
 * standard (non-partner) app installs. The shop domain is stored in metadata
 * as it is required for every subsequent API call.
 *
 * IMPORTANT: Does NOT trigger a backfill here. Backfill is triggered by the
 * scheduler (Plan 06).
 *
 * Required env vars:
 *   SHOPIFY_API_KEY       — Shopify app API key (client ID)
 *   SHOPIFY_API_SECRET    — Shopify app API secret (client secret)
 *   NEXT_PUBLIC_APP_URL   — Base URL for constructing the redirect_uri
 *   OAUTH_STATE_SECRET    — Secret for HMAC state verification
 *   TOKEN_ENCRYPTION_KEY  — 32-byte key as 64 hex chars for AES-256-GCM
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const shop = searchParams.get('shop');
  const errorParam = searchParams.get('error');

  // Handle errors returned by Shopify
  if (errorParam) {
    return NextResponse.json(
      { error: 'OAuth authorization denied', details: errorParam },
      { status: 400 }
    );
  }

  if (!code || !state || !shop) {
    return NextResponse.json(
      { error: 'Missing code, state, or shop parameter' },
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

  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Shopify OAuth is not fully configured' },
      { status: 500 }
    );
  }

  try {
    // Exchange authorization code for permanent access token
    const tokenRes = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code,
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return NextResponse.json(
        { error: 'Failed to exchange code for access token', details: err },
        { status: 502 }
      );
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      scope: string;
      expires_in?: number;
      associated_user_scope?: string;
    };

    const accessToken = tokenData.access_token;
    // Shopify permanent tokens do not expire; online tokens have expires_in
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Step 2: Fetch shop details for display name
    const shopRes = await fetch(
      `https://${shop}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
        },
      }
    );

    let shopName: string | null = null;
    if (shopRes.ok) {
      const shopData = await shopRes.json() as { shop?: { name?: string } };
      shopName = shopData.shop?.name ?? null;
    }

    // Step 3: Persist encrypted credentials
    const integration = await saveIntegration({
      tenantId,
      platform: 'shopify',
      accountId: shop,
      accountName: shopName,
      accessToken,
      refreshToken: null, // Shopify permanent tokens have no refresh token
      tokenExpiresAt,
      metadata: {
        shop,
        scope: tokenData.scope,
      },
    });

    // Step 4: Auto-max backfill on first connection (user decision: INTG-05)
    // Shopify: pull all available order history — the connector uses read_all_orders scope
    const threeYearsAgo = format(subYears(new Date(), 3), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    enqueueBackfill(tenantId, 'shopify', integration.id, {
      start: threeYearsAgo,
      end: today,
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[shopify-callback] Failed to enqueue backfill for integration ${integration.id}: ${message}`);
    });

    registerNightlySync(tenantId, 'shopify', integration.id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[shopify-callback] Failed to register nightly sync for integration ${integration.id}: ${message}`);
    });

    return NextResponse.json({
      success: true,
      integrationId: integration.id,
      platform: 'shopify',
      shop,
      accountName: shopName,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Shopify OAuth callback failed', details: message },
      { status: 500 }
    );
  }
}
