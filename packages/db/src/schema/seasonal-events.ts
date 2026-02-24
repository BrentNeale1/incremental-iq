import { pgPolicy, pgTable, uuid, text, date, numeric, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Seasonal events — pre-loaded retail events and user-editable brand events.
 *
 * System events (tenantId IS NULL): Pre-loaded US/global retail calendar
 *   — BFCM, Christmas, New Year, Valentine's Day, Mother's Day, Father's Day,
 *     Prime Day, Back to School, Easter, Labor Day, Memorial Day.
 *   These are readable by all tenants via the RLS policy.
 *
 * Brand events (tenantId set): User-created events per tenant
 *   — Flash sales, product launches, annual promotions.
 *   These are readable only by the owning tenant.
 *
 * The `year` column distinguishes recurring events (year IS NULL) from
 * one-time dated events (year = specific year).
 *
 * `windowBefore` / `windowAfter`: how many days around eventDate the engine
 * should treat as part of the event window (passed to Prophet as holiday
 * lower_window / upper_window).
 *
 * RLS policy grants access when:
 *   - tenant_id IS NULL (system event readable by all), OR
 *   - tenant_id matches the current tenant (brand event)
 */
export const seasonalEvents = pgTable('seasonal_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id'), // NULL = system event (pre-loaded)
  name: text('name').notNull(),
  eventDate: date('event_date').notNull(),
  windowBefore: numeric('window_before', { precision: 4, scale: 0 }).default('0'),
  windowAfter: numeric('window_after', { precision: 4, scale: 0 }).default('0'),
  isUserDefined: boolean('is_user_defined').notNull().default(false),
  year: numeric('year', { precision: 4, scale: 0 }), // NULL = recurring; set = specific year
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
