import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Better Auth managed tables.
 *
 * IMPORTANT: These tables do NOT have RLS (Pitfall 6 — Better Auth reads/writes
 * these tables outside of tenant transaction context, e.g., during login before
 * a tenant identity is established). Tenant data isolation is enforced at the
 * application layer by reading tenantId from session.user.tenantId.
 *
 * tenantId on authUser links Better Auth users to the tenants isolation root.
 */

/**
 * authUser — Better Auth user table (table name: "user").
 *
 * tenantId is a custom additionalField linking the auth user to the tenants table.
 * It is required and set programmatically at sign-up (input: false in auth config).
 */
export const authUser = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * authSession — Better Auth session table (table name: "session").
 *
 * Sessions are database-backed (no cookieCache) to support immediate invalidation
 * on logout (AUTH-03 requirement).
 */
export const authSession = pgTable('session', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id').notNull().references(() => authUser.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * authAccount — Better Auth account table (table name: "account").
 *
 * Stores OAuth and credential provider data per user.
 * For email/password auth, password hash is stored here.
 */
export const authAccount = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull().references(() => authUser.id),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * authVerification — Better Auth verification table (table name: "verification").
 *
 * Stores password reset tokens and email verification tokens.
 * Token expiry and single-use enforcement are handled by Better Auth.
 */
export const authVerification = pgTable('verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
