import { pgPolicy, pgTable, uuid, text, boolean, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Per-tenant user preferences — persisted dashboard settings.
 *
 * One row per tenant (upsert pattern — no separate user rows until Phase 6 auth).
 *
 * `kpiOrder`: ordered array of KPI metric keys the user has configured
 *   e.g., ['spend', 'revenue', 'roas', 'incremental_revenue']
 *
 * `viewMode`: 'executive' (simplified) | 'analyst' (full statistical detail)
 *
 * `darkMode`: true = dark theme, false = light theme (default)
 *
 * `brandColors`: optional tenant brand color overrides
 *   e.g., { primary: '#1a73e8', secondary: '#34a853' }
 *
 * `notificationPreferences`: per-type, per-channel toggles
 *   e.g., { anomaly_detected: { in_app: true, email: false }, ... }
 *
 * RLS scopes preferences to the owning tenant only.
 */
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().unique(),
  kpiOrder: jsonb('kpi_order').$type<string[]>().default(
    sql`'["spend","revenue","roas","incremental_revenue"]'::jsonb`,
  ),
  viewMode: text('view_mode').notNull().default('executive'), // 'executive' | 'analyst'
  darkMode: boolean('dark_mode').notNull().default(false),
  brandColors: jsonb('brand_colors').$type<Record<string, string>>(),
  notificationPreferences: jsonb('notification_preferences').$type<
    Record<string, { in_app: boolean; email: boolean }>
  >().default(
    sql`'{"anomaly_detected":{"in_app":true,"email":false},"recommendation_ready":{"in_app":true,"email":false},"seasonal_alert":{"in_app":true,"email":true},"data_health":{"in_app":true,"email":true}}'::jsonb`,
  ),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
