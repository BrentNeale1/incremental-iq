---
phase: 02-core-data-ingestion
plan: 02
subsystem: api
tags: [nextjs, oauth, meta-ads, google-ads, shopify, drizzle, rls, aes-256-gcm, hmac, csrf]

# Dependency graph
requires:
  - phase: 02-01
    provides: integrations/sync_runs Drizzle schema, packages/ingestion with encryptToken, withTenant from packages/db
provides:
  - Next.js App Router application (apps/web) with package @incremental-iq/web
  - Drizzle migration 0002_legal_puma.sql for integrations and sync_runs tables with ENABLE + FORCE RLS
  - OAuth initiation routes: /api/oauth/meta, /api/oauth/google, /api/oauth/shopify
  - OAuth callback routes: /api/oauth/meta/callback, /api/oauth/google/callback, /api/oauth/shopify/callback
  - lib/oauth-helpers.ts: saveIntegration, generateState, verifyState
affects: [03-statistical-engine, 04-analysis-api, 06-scheduling-worker]

# Tech tracking
tech-stack:
  added: [next@15, react@19, react-dom@19]
  patterns:
    - Next.js App Router route handlers (export async function GET)
    - HMAC-SHA256 signed state parameter for OAuth CSRF protection
    - AES-256-GCM token encryption before DB insert via encryptToken from packages/ingestion
    - withTenant() RLS context wrapper for all integration inserts
    - serverExternalPackages: ['postgres'] in next.config.ts to prevent bundling native modules

key-files:
  created:
    - apps/web/package.json
    - apps/web/tsconfig.json
    - apps/web/next.config.ts
    - apps/web/app/layout.tsx
    - apps/web/app/page.tsx
    - apps/web/app/api/oauth/meta/route.ts
    - apps/web/app/api/oauth/meta/callback/route.ts
    - apps/web/app/api/oauth/google/route.ts
    - apps/web/app/api/oauth/google/callback/route.ts
    - apps/web/app/api/oauth/shopify/route.ts
    - apps/web/app/api/oauth/shopify/callback/route.ts
    - apps/web/lib/oauth-helpers.ts
    - packages/db/migrations/0002_legal_puma.sql
  modified:
    - packages/db/migrations/meta/_journal.json
    - pnpm-lock.yaml

key-decisions:
  - "Migration named 0002_legal_puma.sql — drizzle-kit generated name kept as-is (same pattern as Phase 1)"
  - "FORCE ROW LEVEL SECURITY appended to 0002_legal_puma.sql (not drizzle-kit generated) — same pattern as 0000_aberrant_namora.sql"
  - "Meta callback exchanges short-lived token for long-lived token (60-day expiry) before storage — avoids frequent re-auth"
  - "Google callback stores both customerId and loginCustomerId in metadata — required for MCC account API calls (RESEARCH.md Pitfall 5)"
  - "Shopify permanent tokens have no expiry and no refresh token — tokenExpiresAt null for offline installs"
  - "No backfill triggered from any HTTP callback handler — Plan 06 scheduler responsibility (RESEARCH.md anti-pattern)"
  - "State parameter format: base64url(tenantId) + '.' + HMAC-SHA256(payload) with timing-safe comparison"
  - "serverExternalPackages: ['postgres'] in next.config.ts — postgres.js native modules must not be bundled by Next.js"

patterns-established:
  - "OAuth route pair pattern: /api/oauth/{platform}/route.ts (initiation) + /api/oauth/{platform}/callback/route.ts (exchange)"
  - "CSRF protection pattern: generateState(tenantId) on initiate, verifyState(state) on callback before any token use"
  - "Token storage pattern: encryptToken() before insert, withTenant() for RLS context — plaintext never hits DB"
  - "No side effects from OAuth callbacks: exchange tokens, store credentials, return JSON — never trigger background jobs inline"

requirements-completed: [INTG-01, INTG-02, INTG-03]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 2 Plan 02: OAuth Routes and Drizzle Migration Summary

**Next.js App Router with 6 OAuth routes (Meta/Google/Shopify initiate+callback), AES-256-GCM token encryption, HMAC-SHA256 CSRF protection, and Drizzle migration 0002_legal_puma.sql with FORCE RLS for integrations and sync_runs**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T05:12:00Z
- **Completed:** 2026-02-24T05:20:55Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Generated Drizzle migration for integrations and sync_runs tables with ENABLE + FORCE RLS and restrictive tenant_isolation policies
- Scaffolded apps/web as a Next.js 15 App Router application compiling with zero TypeScript errors
- Implemented 6 OAuth routes: initiation redirects + callback handlers for Meta Ads, Google Ads, and Shopify
- Shared oauth-helpers.ts provides saveIntegration (encrypt + insert), generateState/verifyState (HMAC-SHA256 CSRF)
- No backfill logic in any HTTP handler — clean separation from scheduler (Plan 06)

## Task Commits

Each task was committed atomically:

1. **Task 1: Generate Drizzle migration for integrations and sync_runs tables** - `bad87be` (feat)
2. **Task 2: Scaffold apps/web Next.js app with OAuth routes for all three platforms** - `89220b6` (feat)

**Plan metadata:** (docs commit following)

## Files Created/Modified
- `packages/db/migrations/0002_legal_puma.sql` - CREATE TABLE integrations + sync_runs, ENABLE + FORCE RLS, tenant_isolation policies
- `packages/db/migrations/meta/_journal.json` - Updated with 3rd entry (0002_legal_puma)
- `apps/web/package.json` - @incremental-iq/web with Next.js 15, React 19, workspace deps
- `apps/web/tsconfig.json` - App Router tsconfig with @/* path alias
- `apps/web/next.config.ts` - serverExternalPackages: ['postgres']
- `apps/web/app/layout.tsx` - Minimal root layout
- `apps/web/app/page.tsx` - Placeholder home page with OAuth flow links
- `apps/web/lib/oauth-helpers.ts` - saveIntegration, generateState, verifyState
- `apps/web/app/api/oauth/meta/route.ts` - Meta Ads OAuth initiation (Facebook v23.0 dialog)
- `apps/web/app/api/oauth/meta/callback/route.ts` - Meta callback: short→long-lived token exchange, ad accounts fetch
- `apps/web/app/api/oauth/google/route.ts` - Google Ads OAuth initiation (adwords scope, offline, forced consent)
- `apps/web/app/api/oauth/google/callback/route.ts` - Google callback: token exchange, listAccessibleCustomers (MCC support)
- `apps/web/app/api/oauth/shopify/route.ts` - Shopify OAuth initiation (read_orders,read_all_orders scope)
- `apps/web/app/api/oauth/shopify/callback/route.ts` - Shopify callback: permanent token exchange, shop details fetch

## Decisions Made
- Migration named 0002_legal_puma.sql — drizzle-kit generated name kept (same Phase 1 pattern, renaming breaks _journal.json)
- FORCE ROW LEVEL SECURITY appended manually to generated migration file — same atomic-with-table-creation pattern as Phase 1
- Meta callback exchanges short-lived token for long-lived (60-day) before storage — avoids needing refresh token
- Google callback stores both customerId and loginCustomerId — required to prevent USER_PERMISSION_DENIED on MCC accounts
- Shopify permanent tokens have null tokenExpiresAt — they do not expire for offline (private app) installs
- No backfill triggered from HTTP handlers — explicitly documented as anti-pattern, Plan 06 scheduler responsibility
- State parameter uses timing-safe comparison (timingSafeEqual) to prevent timing attack on HMAC verification
- serverExternalPackages: ['postgres'] prevents Next.js from bundling postgres.js native modules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- /dev/stdin pipe does not work on Windows for Node.js inline verification — verified journal entry count by reading file directly. No impact on output.

## User Setup Required

The following environment variables must be configured before OAuth flows will work:

- `FACEBOOK_APP_ID` — Meta app client ID
- `FACEBOOK_APP_SECRET` — Meta app client secret
- `GOOGLE_ADS_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_ADS_CLIENT_SECRET` — Google OAuth client secret
- `GOOGLE_ADS_DEVELOPER_TOKEN` — Google Ads developer token (required for API calls)
- `SHOPIFY_API_KEY` — Shopify app API key
- `SHOPIFY_API_SECRET` — Shopify app API secret
- `TOKEN_ENCRYPTION_KEY` — 32 bytes as 64 hex chars (`node -e "require('crypto').randomBytes(32).toString('hex')"`)
- `OAUTH_STATE_SECRET` — HMAC signing secret for state parameter
- `NEXT_PUBLIC_APP_URL` — Base URL for constructing redirect_uri (e.g., `https://app.incrementaliq.com`)
- `DATABASE_URL` — PostgreSQL connection string

## Next Phase Readiness
- Drizzle migration 0002_legal_puma.sql ready to run against production DB (after app_user role exists)
- All 6 OAuth routes operational — connected ad accounts will store encrypted tokens in integrations table
- Plan 03 (connectors) can now read integration records and decrypt tokens for API calls
- Plan 04-06 (API, scheduler) can query integrations table via withTenant() for sync jobs

## Self-Check: PASSED

| Item | Status |
|------|--------|
| packages/db/migrations/0002_legal_puma.sql | FOUND |
| apps/web/lib/oauth-helpers.ts | FOUND |
| apps/web/app/api/oauth/meta/callback/route.ts | FOUND |
| apps/web/app/api/oauth/google/callback/route.ts | FOUND |
| apps/web/app/api/oauth/shopify/callback/route.ts | FOUND |
| .planning/phases/02-core-data-ingestion/02-02-SUMMARY.md | FOUND |
| Commit bad87be (Task 1) | FOUND |
| Commit 89220b6 (Task 2) | FOUND |
| TypeScript: tsc --noEmit --skipLibCheck | PASS (zero errors) |

---
*Phase: 02-core-data-ingestion*
*Completed: 2026-02-24*
