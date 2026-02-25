import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

/**
 * The tenants table represents organizations / accounts.
 *
 * This table does NOT have RLS — it is the root of the isolation hierarchy.
 * Access to this table is controlled by application-level auth, not RLS.
 *
 * The analysisUnlocked field implements the ARCH-03 gate:
 * once a tenant has >= 1 year of complete historical data, this flag is set
 * to true to allow the incremental lift analysis to run.
 */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('starter'), // 'starter' | 'growth' | 'agency'
  // ARCH-03: Analysis gate — set to true once >= 1 year coverage is confirmed
  analysisUnlocked: boolean('analysis_unlocked').default(false).notNull(),
  analysisUnlockedAt: timestamp('analysis_unlocked_at', { withTimezone: true }),
  // Phase 5: Outcome mode gates UI language throughout the dashboard
  // 'ecommerce' = revenue/ROAS terminology; 'lead_gen' = leads/conversion terminology
  outcomeMode: text('outcome_mode').default('ecommerce').notNull(),
  // Phase 7: Onboarding tracking — set to true once wizard is completed
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
