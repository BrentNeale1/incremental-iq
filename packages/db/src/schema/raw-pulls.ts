import { pgPolicy, pgTable, uuid, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles.js';

/**
 * Immutable raw API landing zone.
 *
 * All raw API responses are stored verbatim before any transformation.
 * The `normalized` flag tracks whether the normalization pipeline has
 * processed each record. Normalization NEVER modifies raw records —
 * it writes to campaign_metrics only.
 *
 * Why immutable: If the normalization schema changes (e.g. attribution window
 * definition changes — Pitfall 3 from RESEARCH.md), we can re-normalize from
 * raw data without re-fetching from the API.
 *
 * Pitfall 3 (Attribution Window): The `attributionWindow` field stores the
 * window configuration used when the API was called (e.g. '7d_click_1d_view').
 * If Meta changes their default attribution window, data before and after the
 * change is incompatible. Storing the window allows the normalization layer
 * to detect and handle such changes.
 *
 * This table is a TimescaleDB hypertable candidate (partitioned on pulled_at).
 * The hypertable conversion is in a custom migration (not managed by Drizzle).
 */
export const rawApiPulls = pgTable('raw_api_pulls', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  source: text('source').notNull(),               // 'meta' | 'google_ads' | 'shopify' | etc
  // NOT NULL required for TimescaleDB hypertable time column
  pulledAt: timestamp('pulled_at', { withTimezone: true }).defaultNow().notNull(),
  apiVersion: text('api_version'),                // e.g. 'v21.0' for Meta
  // Pitfall 3: store the attribution window config alongside the payload
  attributionWindow: text('attribution_window'),  // e.g. '7d_click_1d_view'
  apiParams: jsonb('api_params').notNull(),       // what query was issued
  payload: jsonb('payload').notNull(),            // raw API response, unmodified
  normalized: boolean('normalized').default(false).notNull(),
  normalizedAt: timestamp('normalized_at', { withTimezone: true }),
  schemaVersion: text('schema_version'),          // normalization schema version applied
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
