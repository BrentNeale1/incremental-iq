---
phase: 06-authentication
plan: 01
subsystem: auth
tags: [better-auth, drizzle, middleware, session, multi-tenant]
dependency_graph:
  requires:
    - packages/db (Drizzle instance, tenants schema)
    - apps/web (Next.js 15 App Router)
    - resend (already installed)
  provides:
    - Better Auth server instance (apps/web/auth.ts)
    - Auth client instance (apps/web/auth-client.ts)
    - Route protection middleware (apps/web/middleware.ts)
    - Auth API handler (/api/auth/[...all])
    - Auth schema + migration (packages/db)
    - TenantProvider context + useTenantId hook
  affects:
    - apps/web/app/(dashboard)/layout.tsx (now server component with auth guard)
    - All 5 dashboard page components (tenantId wired from session)
    - AppHeader (tenantId prop replaces PLACEHOLDER_TENANT_ID)
tech_stack:
  added:
    - better-auth ^1.4.19 (email/password auth, Drizzle adapter, session management)
  patterns:
    - drizzleAdapter connecting Better Auth to existing postgres.js db instance
    - Server component → client component split for auth guard + client UI
    - React context (TenantProvider) for distributing tenantId to deep client components
    - Optimistic middleware (cookie check) + server-side validation (DB round-trip) in layers
key_files:
  created:
    - apps/web/auth.ts
    - apps/web/auth-client.ts
    - apps/web/middleware.ts
    - apps/web/app/api/auth/[...all]/route.ts
    - apps/web/components/layout/DashboardLayoutClient.tsx
    - apps/web/lib/auth/tenant-context.tsx
    - apps/web/emails/PasswordResetEmail.tsx
    - packages/db/src/schema/auth.ts
    - packages/db/migrations/0006_auth.sql
  modified:
    - packages/db/src/schema/index.ts (re-export auth tables)
    - packages/db/migrations/meta/_journal.json (entry idx 6)
    - apps/web/package.json (better-auth dependency)
    - apps/web/app/(dashboard)/layout.tsx (server component auth guard)
    - apps/web/components/layout/AppHeader.tsx (tenantId prop)
    - apps/web/app/(dashboard)/page.tsx (useTenantId)
    - apps/web/app/(dashboard)/health/page.tsx (useTenantId)
    - apps/web/app/(dashboard)/insights/page.tsx (useTenantId)
    - apps/web/app/(dashboard)/performance/page.tsx (useTenantId)
    - apps/web/app/(dashboard)/seasonality/page.tsx (useTenantId)
decisions:
  - "Better Auth v1.4.19 installed in apps/web — Drizzle adapter connects to existing postgres.js db"
  - "Auth tables (user, session, account, verification) have NO RLS — Better Auth operates outside tenant context during auth flows (Pitfall 6)"
  - "No cookieCache — immediate session invalidation on logout required by AUTH-03"
  - "30-day expiresIn + 1-day updateAge — locked decisions from CONTEXT.md"
  - "TenantProvider React context created to distribute tenantId to deep client components in dashboard pages"
  - "DashboardLayout split: outer server component (auth.api.getSession) + inner DashboardLayoutClient (all client UI)"
  - "PasswordResetEmail.tsx created in apps/web/emails — uses existing Resend + @react-email/components"
  - "sendPasswordResetEmail called with void (fire-and-forget) to prevent timing attacks"
metrics:
  duration: 7 min
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 20
---

# Phase 6 Plan 01: Better Auth Foundation Summary

Better Auth v1.4.19 installed and configured with Drizzle adapter, 30-day sliding sessions, email/password auth, auth schema migration (0006_auth.sql), route protection middleware, server-side session validation in dashboard layout, and tenantId wired from session replacing all PLACEHOLDER_TENANT_ID references.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install Better Auth, create auth schema and migration | e0bc1a6 | packages/db/src/schema/auth.ts, packages/db/migrations/0006_auth.sql, apps/web/package.json |
| 2 | Configure Better Auth server/client, API handler, middleware, dashboard auth guard | c1cba35 | apps/web/auth.ts, apps/web/middleware.ts, apps/web/app/(dashboard)/layout.tsx, DashboardLayoutClient.tsx, tenant-context.tsx |

## Verification

1. `better-auth: "^1.4.19"` in apps/web/package.json — PASS
2. `packages/db/src/schema/auth.ts` exports authUser, authSession, authAccount, authVerification — PASS
3. `packages/db/src/schema/index.ts` re-exports from `./auth` — PASS
4. `packages/db/migrations/0006_auth.sql` has 4 CREATE TABLE statements, zero RLS statements — PASS
5. `apps/web/auth.ts` creates betterAuth with drizzleAdapter, emailAndPassword enabled, 30-day sessions, tenantId additionalField, no cookieCache — PASS
6. `apps/web/auth-client.ts` creates createAuthClient instance — PASS
7. `apps/web/middleware.ts` uses getSessionCookie, redirects unauthenticated to /login, authenticated away from auth pages — PASS
8. `apps/web/app/api/auth/[...all]/route.ts` exports GET and POST via toNextJsHandler — PASS
9. `apps/web/app/(dashboard)/layout.tsx` is server component calling auth.api.getSession(), redirects to /login, passes tenantId — PASS

## Decisions Made

- **Better Auth v1.4.19**: Drizzle adapter (provider: "pg") connects to existing postgres.js db instance in `@incremental-iq/db`
- **No RLS on auth tables**: Better Auth reads/writes user/session/account/verification outside tenant transaction context. Tenant isolation enforced at application layer via `session.user.tenantId`
- **No cookieCache**: Immediate session invalidation on logout is required by AUTH-03. Default DB-backed sessions used.
- **30-day sessions with 1-day sliding window**: `expiresIn: 2592000, updateAge: 86400` — locked decisions from CONTEXT.md
- **TenantProvider React context**: Created `lib/auth/tenant-context.tsx` with TenantProvider and `useTenantId()` hook. All 5 dashboard page components now call `useTenantId()` instead of `PLACEHOLDER_TENANT_ID = undefined`
- **Server/client layout split**: `DashboardLayout` (server) calls `auth.api.getSession()` and renders `DashboardLayoutClient` (client) with `tenantId` prop. Client component handles Zustand rehydration, SidebarProvider, AppHeader, StaleDataBanner.
- **void sendPasswordResetEmail**: Called with `void` (not await) inside `sendResetPassword` hook to prevent timing attacks that would reveal email existence
- **PasswordResetEmail template**: Created in `apps/web/emails/` following the same pattern as existing DataHealthAlert.tsx and SeasonalDeadline.tsx

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Replaced PLACEHOLDER_TENANT_ID in all dashboard pages**
- **Found during:** Task 2
- **Issue:** Plan specified replacing PLACEHOLDER_TENANT_ID in dashboard layout and mentioned "tenantId will be passed as a prop through the component tree (or via a React context if needed for deeper descendants)." Dashboard pages are client components that cannot receive props from the server layout directly.
- **Fix:** Created `lib/auth/tenant-context.tsx` with `TenantProvider` + `useTenantId()`. DashboardLayoutClient wraps children in TenantProvider. All 5 dashboard pages (`page.tsx`, `health/page.tsx`, `insights/page.tsx`, `performance/page.tsx`, `seasonality/page.tsx`) and `AppHeader` now use real tenantId from session.
- **Files modified:** lib/auth/tenant-context.tsx (created), DashboardLayoutClient.tsx, AppHeader.tsx, 5 page components
- **Commit:** c1cba35

**2. [Rule 2 - Missing Critical Functionality] Created PasswordResetEmail email template**
- **Found during:** Task 2
- **Issue:** auth.ts `sendResetPassword` references `PasswordResetEmail` component which didn't exist. Needed to create it to avoid import errors.
- **Fix:** Created `apps/web/emails/PasswordResetEmail.tsx` following the existing DataHealthAlert.tsx pattern using @react-email/components
- **Files modified:** apps/web/emails/PasswordResetEmail.tsx (created)
- **Commit:** c1cba35

### Import Path Correction

**[@incremental-iq/db/schema path not exported]**
- **Found during:** Task 2
- **Issue:** auth.ts initially imported from `@incremental-iq/db/schema` but the `packages/db/package.json` only exports `"."` (no `./schema` path). Better Auth tables are re-exported from the main index.
- **Fix:** Changed import in auth.ts to `import { db, authUser, authSession, authAccount, authVerification } from "@incremental-iq/db"` — all items are re-exported from the main package entry.
- **No separate commit** — fixed before Task 2 commit

## Required Environment Variables

Before auth can function, set these in `.env.local`:

```bash
BETTER_AUTH_SECRET=<generate with: openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=<from Resend dashboard>
```

## Self-Check: PASSED
