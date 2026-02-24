---
phase: 02-core-data-ingestion
plan: 06
subsystem: api
tags: [bullmq, redis, cron, scheduler, backfill, sync, rate-limiting, next-api-routes]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: Meta/Google Ads/Shopify connectors (Plans 03-05), processMetaSync, processGoogleAdsSync, processShopifySync, integrations/sync_runs/ingestion_coverage tables

provides:
  - BullMQ ingestion queue with nightly 2am UTC scheduler (upsertJobScheduler, per tenant/platform/integration)
  - processBackfillJob: month-by-month historical pull with live BullMQ progress + DB progressMetadata
  - processSyncJob: incremental and manual sync handler with partial/full failure classification, token expiry detection
  - BullMQ worker (concurrency 3) with graceful SIGTERM/SIGINT shutdown
  - POST /api/integrations/[id]/sync: manual sync trigger, rate-limited (3/day, 1/hour cooldown)
  - GET /api/integrations/[id]/status: per-integration freshness + last 7 sync runs + live backfill progress
  - GET /api/integrations/status: global freshness summary with healthy/warning/error indicator
  - Auto-backfill on first OAuth connect: all three callbacks enqueue 3yr backfill + register nightly sync
  - ARCH-03 gate: checkAndUnlockAnalysis sets tenants.analysisUnlocked after 1yr coverage confirmed

affects:
  - 03-statistical-engine (reads from campaign_metrics/ingestion_coverage populated by this scheduler)
  - 04-recommendations (depends on fresh data via nightly sync)
  - 05-ui (uses freshness/status endpoints for dashboard integration health indicator)

# Tech tracking
tech-stack:
  added: [bullmq (Queue, Worker, upsertJobScheduler), date-fns (eachMonthOfInterval, endOfMonth, subYears, format)]
  patterns:
    - Single BullMQ queue for all ingestion job types (simpler monitoring vs. per-type queues)
    - upsertJobScheduler for idempotent nightly cron registration (safe to call on every deploy/reconnect)
    - Fire-and-forget backfill/scheduler registration from HTTP handlers (no blocking)
    - Job name routing in single worker (incremental-sync + manual-sync → processSyncJob, backfill → processBackfillJob)
    - Rate limiting via sync_runs table count (no Redis TTL required)
    - DB progressMetadata for durability alongside BullMQ job.updateProgress for real-time polling

key-files:
  created:
    - packages/ingestion/src/scheduler/queues.ts
    - packages/ingestion/src/scheduler/workers.ts
    - packages/ingestion/src/scheduler/jobs/sync.ts
    - packages/ingestion/src/scheduler/jobs/backfill.ts
    - apps/web/app/api/integrations/[id]/sync/route.ts
    - apps/web/app/api/integrations/[id]/status/route.ts
    - apps/web/app/api/integrations/status/route.ts
  modified:
    - packages/ingestion/src/index.ts (exports registerNightlySync, enqueueBackfill, enqueueManualSync)
    - apps/web/package.json (added date-fns, drizzle-orm as direct deps)
    - apps/web/app/api/oauth/meta/callback/route.ts (added auto-backfill + nightly sync registration)
    - apps/web/app/api/oauth/google/callback/route.ts (added auto-backfill + nightly sync registration)
    - apps/web/app/api/oauth/shopify/callback/route.ts (added auto-backfill + nightly sync registration)

key-decisions:
  - "Single BullMQ ingestion queue for all job types (sync, backfill, manual) — simpler monitoring, job routing by job.name in worker"
  - "upsertJobScheduler for nightly cron with scheduler ID nightly-{platform}-{tenantId}-{integrationId} — idempotent, one schedule per integration"
  - "Worker concurrency 3 — allows parallel sync across different tenants/platforms without overwhelming DB pool"
  - "Rate limiting via sync_runs table (no Redis) — max 3 manual syncs/day + 1-hour cooldown per integration"
  - "apps/web added drizzle-orm and date-fns as direct dependencies — API routes use Drizzle helpers and date-fns freshness formatting directly"
  - "Auto-backfill is fire-and-forget (non-blocking) from OAuth callbacks — HTTP response returns immediately, errors logged not propagated"
  - "DB progressMetadata updated alongside job.updateProgress for durability across worker restarts"

patterns-established:
  - "Pattern: BullMQ job routing by job.name in single worker (scalable, no per-type worker overhead)"
  - "Pattern: Nightly scheduler ID = nightly-{platform}-{tenantId}-{integrationId} (one scheduler per integration)"
  - "Pattern: First-sync detection in processSyncJob — if lastSyncedAt is null, enqueue backfill and bail early"
  - "Pattern: Token expiry detection from error message keywords ('token expired', 'OAuthException', '401', 'invalid_token')"
  - "Pattern: ARCH-03 gate checked after every backfill completion (non-fatal — logs error but doesn't fail job)"

requirements-completed: [INTG-05]

# Metrics
duration: 9min
completed: 2026-02-24
---

# Phase 2 Plan 06: BullMQ Scheduler and Sync Orchestration Summary

**BullMQ job scheduler with nightly 2am UTC sync per tenant/platform, month-by-month backfill with live progress, auto-triggered on OAuth connect, plus three API endpoints for manual sync (rate-limited), per-integration status, and global freshness dashboard**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-24T05:39:48Z
- **Completed:** 2026-02-24T05:49:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- BullMQ scheduler with `upsertJobScheduler` at `0 2 * * *` (2am UTC) per integration — idempotent, safe on every deploy or reconnect
- Historical backfill chunks by month using `date-fns eachMonthOfInterval`, reports live progress (`job.updateProgress`) for "14 of 36 months pulled" UI
- INTG-05 fully implemented: all three OAuth callbacks auto-enqueue 3yr backfill + register nightly sync on first connection (fire-and-forget)
- ARCH-03 gate: `checkAndUnlockAnalysis` queries ingestion_coverage after backfill, sets `tenants.analysisUnlocked = true` when >= 365 coverage days confirmed
- Rate-limited manual sync endpoint: max 3/day per integration + 1-hour cooldown enforced via sync_runs table

## Task Commits

Each task was committed atomically:

1. **Task 1: BullMQ scheduler with nightly sync and backfill jobs** - `3ce2054` (feat)
2. **Task 2: API endpoints for manual sync, integration status, global freshness** - `be27a17` (feat)
3. **Task 3: Wire OAuth callbacks to trigger auto-backfill** - `08c9512` (feat)

## Files Created/Modified
- `packages/ingestion/src/scheduler/queues.ts` - Redis connection, ingestionQueue, registerNightlySync (upsertJobScheduler), enqueueBackfill, enqueueManualSync
- `packages/ingestion/src/scheduler/workers.ts` - Worker (concurrency 3), job name routing, graceful SIGTERM/SIGINT shutdown
- `packages/ingestion/src/scheduler/jobs/sync.ts` - processSyncJob: incremental/manual handler, first-sync backfill trigger, partial/full/expired failure classification
- `packages/ingestion/src/scheduler/jobs/backfill.ts` - processBackfillJob: monthly chunking, live progress, platform-specific lookback limits, ARCH-03 gate check
- `packages/ingestion/src/index.ts` - exports scheduler queue helpers from package root
- `apps/web/app/api/integrations/[id]/sync/route.ts` - POST manual sync trigger with rate limiting (3/day + 1hr cooldown)
- `apps/web/app/api/integrations/[id]/status/route.ts` - GET per-integration status: last 7 syncs, freshness string, syncInProgress + progress metadata
- `apps/web/app/api/integrations/status/route.ts` - GET global freshness: healthy/warning/error, warnings array for banner
- `apps/web/package.json` - added drizzle-orm, date-fns as direct dependencies
- `apps/web/app/api/oauth/meta/callback/route.ts` - added auto-backfill + nightly sync after saveIntegration
- `apps/web/app/api/oauth/google/callback/route.ts` - added auto-backfill + nightly sync after saveIntegration
- `apps/web/app/api/oauth/shopify/callback/route.ts` - added auto-backfill + nightly sync after saveIntegration

## Decisions Made
- Single BullMQ queue for all job types — simpler monitoring, routing by `job.name` in worker
- `upsertJobScheduler` scheduler ID `nightly-{platform}-{tenantId}-{integrationId}` — one schedule per integration, idempotent
- Rate limiting via `sync_runs` table count queries (no Redis TTL) — max 3/day + 1-hour cooldown per integration
- Fire-and-forget backfill/scheduler registration from OAuth callbacks — HTTP response returns immediately
- Both `job.updateProgress` AND `syncRuns.progressMetadata` updated for backfill progress — BullMQ for real-time polling, DB for durability

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added drizzle-orm and date-fns to apps/web package.json**
- **Found during:** Task 2 (API endpoint implementation)
- **Issue:** API routes import `eq`, `and`, `desc`, `count` from `drizzle-orm` and `formatDistanceToNow` from `date-fns` directly, but neither was a direct dependency of the web app — only `@incremental-iq/db` and `@incremental-iq/ingestion` were listed
- **Fix:** Added `"date-fns": "^3.0.0"` and `"drizzle-orm": "0.45.1"` to `apps/web/package.json` dependencies, ran `pnpm install`
- **Files modified:** `apps/web/package.json`
- **Verification:** `cd apps/web && npx tsc --noEmit --skipLibCheck` — zero errors
- **Committed in:** `be27a17` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Required for TypeScript to resolve drizzle-orm and date-fns imports in Next.js API routes. No scope creep.

## Issues Encountered
None beyond the missing dependency auto-fix.

## User Setup Required
None for this plan. Prerequisite environment variables were already listed in earlier plans:
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` — needed at worker runtime
- `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY` — already documented in Phase 2 Plans 01-05

## Next Phase Readiness
- Phase 2 is complete. All 6 plans executed.
- The ingestion pipeline is fully wired: OAuth connect → auto-backfill → nightly sync → fresh campaign_metrics data
- Phase 3 (Statistical Engine) can read from `campaign_metrics` and `ingestion_coverage` tables — `tenants.analysisUnlocked` gates entry
- The worker process (`packages/ingestion/src/scheduler/workers.ts`) must be deployed as a separate Node.js process alongside the Next.js app

---
*Phase: 02-core-data-ingestion*
*Completed: 2026-02-24*

## Self-Check: PASSED

All created files exist on disk. All task commits verified in git log.

| Check | Result |
|-------|--------|
| packages/ingestion/src/scheduler/queues.ts | FOUND |
| packages/ingestion/src/scheduler/workers.ts | FOUND |
| packages/ingestion/src/scheduler/jobs/sync.ts | FOUND |
| packages/ingestion/src/scheduler/jobs/backfill.ts | FOUND |
| apps/web/app/api/integrations/[id]/sync/route.ts | FOUND |
| apps/web/app/api/integrations/[id]/status/route.ts | FOUND |
| apps/web/app/api/integrations/status/route.ts | FOUND |
| Commit 3ce2054 (Task 1) | FOUND |
| Commit be27a17 (Task 2) | FOUND |
| Commit 08c9512 (Task 3) | FOUND |
