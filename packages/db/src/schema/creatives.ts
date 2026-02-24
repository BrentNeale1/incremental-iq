import { pgPolicy, pgTable, uuid, text, timestamp, numeric, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appRole } from './roles';

/**
 * Creative metadata table (ARCH-01).
 *
 * Stores metadata for ad creative assets. The `ads` table references this
 * via foreign key (creative_id). No UI or analysis logic in v1 — the schema
 * is ready and Phase 2 will populate it during ad data ingestion.
 *
 * Why columns now: Adding nullable columns to a large table in production
 * requires a table rewrite. Designing for the columns now prevents schema
 * drift between code and db in v2.
 */
export const creatives = pgTable('creatives', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  externalId: text('external_id').notNull(),    // Platform's creative ID
  source: text('source').notNull(),              // 'meta' | 'google_ads' | etc
  name: text('name'),
  format: text('format'),                        // 'image' | 'video' | 'carousel' | 'text'
  headline: text('headline'),
  primaryText: text('primary_text'),             // ad copy / body
  description: text('description'),
  callToAction: text('call_to_action'),
  imageUrl: text('image_url'),
  videoUrl: text('video_url'),
  thumbnailUrl: text('thumbnail_url'),
  aspectRatio: text('aspect_ratio'),             // '1:1' | '9:16' | '4:5' | etc
  durationSeconds: numeric('duration_seconds', { precision: 6, scale: 1 }),
  externalMetadata: jsonb('external_metadata'),  // Raw platform creative metadata
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
