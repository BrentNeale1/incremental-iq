import { pgPolicy, pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * In-app notification rows — one row per notification per tenant.
 *
 * Notification types:
 *   'anomaly_detected'       — Statistical anomaly found for a campaign
 *   'recommendation_ready'   — New scoring run completed; new recommendations available
 *   'seasonal_alert'         — Upcoming seasonal event within planning window
 *   'data_health'            — Integration sync failing, token expired, or data gap detected
 *
 * `linkPath`: optional relative URL to navigate to when notification is clicked
 * (e.g., '/insights?campaignId=...' or '/health').
 *
 * RLS scopes notifications to the owning tenant only.
 */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  type: text('type').notNull(), // 'anomaly_detected' | 'recommendation_ready' | 'seasonal_alert' | 'data_health'
  message: text('message').notNull(),
  linkPath: text('link_path'),  // optional relative URL for click-through
  read: boolean('read').notNull().default(false),
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
