import { pgPolicy, pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * OAuth credential store for all ad platform integrations.
 *
 * Each row represents one platform connection for one tenant.
 * Tokens are stored AES-256-GCM encrypted (see packages/ingestion/src/crypto.ts).
 *
 * Status lifecycle:
 *   connected → token valid, sync running normally
 *   expired   → token expired, re-authorization required (triggers in-app warning)
 *   error     → sync failing for non-auth reason
 *
 * The metadata jsonb column stores platform-specific data that doesn't
 * warrant dedicated columns, e.g.:
 *   Meta:        { adAccountId: 'act_123456', loginCustomerId: null }
 *   Google Ads:  { customerId: '123-456-7890', loginCustomerId: '111-222-3333' }
 *   Shopify:     { shop: 'mystore.myshopify.com' }
 *
 * Pitfall (Google Ads Pitfall 5 from RESEARCH.md): loginCustomerId must be stored
 * alongside customerId for manager account (MCC) connections — failing to store
 * both causes USER_PERMISSION_DENIED errors on every API call.
 */
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  platform: text('platform').notNull(),                   // 'meta' | 'google_ads' | 'shopify'
  status: text('status').notNull(),                       // 'connected' | 'error' | 'expired'
  accountId: text('account_id'),                          // platform's account/store identifier
  accountName: text('account_name'),                      // display name for UI

  // All token fields stored AES-256-GCM encrypted — plaintext never written to DB
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

  // Platform-specific metadata (e.g., { loginCustomerId, adAccountId })
  metadata: jsonb('metadata'),

  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status'),               // 'success' | 'partial' | 'failed'

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
