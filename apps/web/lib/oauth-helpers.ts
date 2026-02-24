import { createHmac, timingSafeEqual } from 'crypto';
import { db, withTenant } from '@incremental-iq/db';
import { integrations } from '@incremental-iq/db';
import { encryptToken } from '@incremental-iq/ingestion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SaveIntegrationParams {
  tenantId: string;
  platform: string;
  accountId: string | null;
  accountName: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface SavedIntegration {
  id: string;
  tenantId: string;
  platform: string;
  status: string;
  accountId: string | null;
  accountName: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// saveIntegration
// ---------------------------------------------------------------------------

/**
 * Encrypts OAuth tokens and inserts a new integration row into the database.
 *
 * Tokens are encrypted using AES-256-GCM before being written — plaintext
 * tokens are never persisted. Uses withTenant() for RLS context so the insert
 * can only succeed if app.current_tenant_id matches the tenantId.
 */
export async function saveIntegration(
  params: SaveIntegrationParams
): Promise<SavedIntegration> {
  const {
    tenantId,
    platform,
    accountId,
    accountName,
    accessToken,
    refreshToken,
    tokenExpiresAt,
    metadata,
  } = params;

  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  const [record] = await withTenant(tenantId, async (tx) => {
    return tx
      .insert(integrations)
      .values({
        tenantId,
        platform,
        status: 'connected',
        accountId,
        accountName,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt,
        metadata,
      })
      .returning({
        id: integrations.id,
        tenantId: integrations.tenantId,
        platform: integrations.platform,
        status: integrations.status,
        accountId: integrations.accountId,
        accountName: integrations.accountName,
        createdAt: integrations.createdAt,
      });
  });

  return record;
}

// ---------------------------------------------------------------------------
// State parameter (CSRF protection)
// ---------------------------------------------------------------------------

/**
 * Gets the OAUTH_STATE_SECRET, throwing if not set.
 */
function getStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error('OAUTH_STATE_SECRET environment variable is not set');
  }
  return secret;
}

/**
 * Creates a signed state parameter for OAuth CSRF protection.
 *
 * Format: base64url( tenantId ) + '.' + HMAC-SHA256( tenantId )
 *
 * The state is sent as the `state` query parameter in the OAuth authorization
 * redirect. On callback, verifyState() checks the HMAC before using any
 * data from the state. This prevents CSRF attacks where an attacker tricks
 * a user into connecting a fraudulent account.
 */
export function generateState(tenantId: string): string {
  const secret = getStateSecret();
  const payload = Buffer.from(tenantId).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verifies and decodes a state parameter received from an OAuth callback.
 *
 * @throws {Error} If the state is missing, malformed, or the HMAC is invalid
 */
export function verifyState(state: string): { tenantId: string } {
  if (!state) {
    throw new Error('Missing state parameter');
  }

  const parts = state.split('.');
  if (parts.length !== 2) {
    throw new Error('Malformed state parameter');
  }

  const [payload, receivedSig] = parts;
  const secret = getStateSecret();
  const expectedSig = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  // Use timing-safe comparison to prevent timing attacks
  const received = Buffer.from(receivedSig, 'base64url');
  const expected = Buffer.from(expectedSig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new Error('Invalid state signature');
  }

  const tenantId = Buffer.from(payload, 'base64url').toString('utf8');
  return { tenantId };
}
