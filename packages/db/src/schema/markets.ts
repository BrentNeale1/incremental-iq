import { pgPolicy, pgTable, uuid, text, timestamp, boolean, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';
import { campaigns } from './campaigns';

/**
 * Multi-market attribution schema (MRKT-01 / MRKT-02)
 *
 * Two tables support market-segmented analysis:
 *   - markets: tenant-owned market definitions (country-level)
 *   - campaign_markets: many-to-many join between campaigns and markets
 *
 * All tables enforce tenant isolation via restrictive RLS policies.
 * NULL marketId on campaign_markets means "Global/Unassigned" per user decision.
 */

/**
 * Tenant markets — country-level market definitions confirmed by users.
 *
 * countryCode: ISO 3166-1 alpha-2 (e.g. 'AU', 'US', 'GB')
 * displayName: user-editable label ('Australia', 'United States')
 * campaignCount: number of campaigns detected for this market (auto-computed)
 * isConfirmed: true once user has reviewed and confirmed this market during onboarding
 */
export const markets = pgTable('markets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  countryCode: text('country_code').notNull(),   // ISO 3166-1 alpha-2: 'AU', 'US', 'GB'
  displayName: text('display_name').notNull(),   // User-editable: 'Australia', 'United States'
  campaignCount: integer('campaign_count').default(0).notNull(),
  isConfirmed: boolean('is_confirmed').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);

/**
 * Campaign-to-market assignments.
 *
 * Each campaign belongs to exactly one market per tenant (unique index on tenantId, campaignId).
 * NULL marketId = "Global/Unassigned" bucket — campaigns with no geo targeting or
 * "worldwide" targeting. Users can reassign these manually.
 *
 * source: 'auto_detected' (populated by market detection) | 'user_assigned' (manually overridden)
 */
export const campaignMarkets = pgTable('campaign_markets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id),
  marketId: uuid('market_id'),                   // NULL = Global/Unassigned
  source: text('source').notNull(),              // 'auto_detected' | 'user_assigned'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('campaign_markets_unique').on(t.tenantId, t.campaignId),
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
