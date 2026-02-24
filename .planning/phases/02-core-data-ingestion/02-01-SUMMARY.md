---
phase: 02-core-data-ingestion
plan: 01
subsystem: database
tags: [drizzle, postgres, rls, aes-256-gcm, bullmq, oauth, facebook-nodejs-business-sdk, google-ads-api, shopify-api, pnpm-workspaces]

# Dependency graph
requires:
  - phase: 01-data-architecture
    provides: Drizzle schema pattern with RLS (pgPolicy, appRole), pgTable conventions, bare imports, packages/db package structure

provides:
  - integrations table: AES-256-GCM encrypted OAuth token store for Meta/Google Ads/Shopify
  - sync_runs table: sync history log with backfill progress tracking (FK to integrations.id)
  - packages/ingestion workspace package with all Phase 2 SDK dependencies installed
  - AES-256-GCM encryptToken/decryptToken utilities for OAuth token storage
  - Shared TypeScript types: Platform, ConnectorConfig, SyncJobData, NormalizedMetric, BackfillProgress
  - PlatformConnector interface contract for Meta, Google Ads, Shopify connector implementations
  - pnpm-workspace.yaml monorepo definition for packages/* and apps/*

affects:
  - 02-02 (Meta connector): implements PlatformConnector, uses ConnectorConfig, encryptToken/decryptToken
  - 02-03 (Google Ads connector): implements PlatformConnector, uses ConnectorConfig
  - 02-04 (Shopify connector): implements PlatformConnector, uses ConnectorConfig
  - 02-05 (scheduler/backfill): uses SyncJobData, BackfillProgress, packages/ingestion
  - 02-06 (normalization): uses NormalizedMetric, RawMetricData, packages/ingestion
  - all future phases: pnpm-workspace.yaml enables apps/* packages (apps/web for OAuth UI)

# Tech tracking
tech-stack:
  added:
    - facebook-nodejs-business-sdk ^23.0.0 (Meta Marketing API client)
    - google-ads-api ^23.0.0 (Google Ads API client, Opteo)
    - "@shopify/shopify-api ^11.0.0 (Shopify OAuth + GraphQL client)"
    - bullmq ^5.0.0 (job queue + scheduler with Redis backend)
    - ioredis ^5.0.0 (Redis client required by BullMQ)
    - p-retry ^6.0.0 (exponential backoff for API calls)
    - p-limit ^5.0.0 (concurrency control for parallel API calls)
    - date-fns ^3.0.0 (date range chunking for backfill)
    - zod ^3.0.0 (runtime validation of API payloads before DB writes)
    - Node.js crypto built-in (AES-256-GCM token encryption, no extra dependency)
  patterns:
    - AES-256-GCM token encryption: iv(12)+authTag(16)+ciphertext concatenated as base64
    - PlatformConnector interface: fetchCampaigns, fetchMetrics, refreshTokenIfNeeded contract
    - packages/ingestion workspace package: same tsconfig pattern as packages/db (ES2022, ESNext, moduleResolution bundler)
    - pnpm workspace with packages/* and apps/* globs

key-files:
  created:
    - packages/db/src/schema/integrations.ts
    - packages/db/src/schema/sync-runs.ts
    - packages/ingestion/package.json
    - packages/ingestion/tsconfig.json
    - packages/ingestion/src/crypto.ts
    - packages/ingestion/src/types.ts
    - packages/ingestion/src/connector-base.ts
    - packages/ingestion/src/index.ts
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
  modified:
    - packages/db/src/schema/index.ts

key-decisions:
  - "packages/ingestion package type is 'module' with exports pointing to ./src/index.ts — matches packages/db pattern, enables workspace:* references"
  - "AES-256-GCM iv+authTag+ciphertext wire format — getKey() reads TOKEN_ENCRYPTION_KEY at call time (not module load) so missing env var throws on encrypt/decrypt, not on import"
  - "PlatformConnector defined as interface (not abstract class) — allows duck-typing and simpler mock implementations in tests"
  - "RawCampaignData and RawMetricData use index signatures ([key: string]: unknown) — platform connectors extend these to add type-safe fields without losing the generic contract"
  - "NormalizedMetric uses string types for numeric fields (not number) — matches Drizzle numeric() column insert type which expects strings"

patterns-established:
  - "Token encryption: always call getKey() inside encryptToken/decryptToken (not at module load) so missing TOKEN_ENCRYPTION_KEY is caught at runtime when first used"
  - "Connector contract: connectors do NOT write to DB and do NOT apply retry logic — those are worker responsibilities"
  - "Schema files: bare imports (no .js extension) throughout packages/ingestion to match packages/db decision"

requirements-completed: [INTG-01, INTG-02, INTG-03, INTG-05]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 2 Plan 01: Foundation — Schema Tables and Ingestion Package Summary

**Drizzle integrations/sync_runs tables with RLS, packages/ingestion scaffold with Meta/Google/Shopify SDKs, AES-256-GCM token encryption, and PlatformConnector interface contract**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T05:10:43Z
- **Completed:** 2026-02-24T05:13:59Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- integrations and sync_runs tables defined in Drizzle schema with restrictive RLS policies matching Phase 1 pattern — ready for Drizzle migration generation
- packages/ingestion workspace package with all Phase 2 SDK dependencies installed (facebook-nodejs-business-sdk, google-ads-api, @shopify/shopify-api, bullmq, ioredis, p-retry, p-limit, date-fns, zod)
- AES-256-GCM token encryption (encryptToken/decryptToken) using Node.js built-in crypto — no extra dependency, authenticated encryption prevents tampering
- PlatformConnector interface contract established for the three platform connectors Plans 02-04 will implement

## Task Commits

Each task was committed atomically:

1. **Task 1: Add integrations and sync_runs schema tables with RLS** - `88a9902` (feat)
2. **Task 2: Scaffold packages/ingestion with dependencies and shared utilities** - `3133953` (feat)

**Plan metadata:** `(created after this summary)`

## Files Created/Modified
- `packages/db/src/schema/integrations.ts` - OAuth credential store table with encrypted token fields, platform status, metadata jsonb, restrictive RLS
- `packages/db/src/schema/sync-runs.ts` - Sync history table with FK to integrations.id, runType/status enums, progressMetadata jsonb for live backfill UI
- `packages/db/src/schema/index.ts` - Added re-exports for integrations and sync-runs
- `packages/ingestion/package.json` - @incremental-iq/ingestion workspace package with all Phase 2 dependencies
- `packages/ingestion/tsconfig.json` - TypeScript config matching packages/db pattern
- `packages/ingestion/src/crypto.ts` - AES-256-GCM encryptToken/decryptToken using TOKEN_ENCRYPTION_KEY env var
- `packages/ingestion/src/types.ts` - Platform, SyncType, SyncStatus, IntegrationStatus, ConnectorConfig, DecryptedCredentials, SyncJobData, BackfillProgress, NormalizedMetric
- `packages/ingestion/src/connector-base.ts` - PlatformConnector interface, RawCampaignData, RawMetricData
- `packages/ingestion/src/index.ts` - Re-exports crypto, types, connector-base
- `pnpm-workspace.yaml` - Monorepo workspace definition (packages/* and apps/*)
- `pnpm-lock.yaml` - Generated lockfile after pnpm install

## Decisions Made
- packages/ingestion exports via `./src/index.ts` directly (no build step required for workspace references) — consistent with packages/db pattern
- getKey() called inside encrypt/decrypt functions rather than at module load time — ensures TOKEN_ENCRYPTION_KEY errors are caught when the function is called, not when the module is imported (better error isolation)
- PlatformConnector as interface not abstract class — duck typing allows simpler test mocks and avoids inheritance coupling
- NormalizedMetric numeric fields are string type — matches Drizzle's numeric() column insert shape which expects string|number but string is safer for decimal precision

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**TOKEN_ENCRYPTION_KEY environment variable is required** before the crypto module can be used:

```bash
# Generate a 32-byte (256-bit) encryption key:
node -e "require('crypto').randomBytes(32).toString('hex')"
# Add the output to .env as:
# TOKEN_ENCRYPTION_KEY=<64-hex-character-string>
```

This env var must be set in all environments where the ingestion worker runs (local dev, Railway production service).

## Next Phase Readiness

- Plan 02 (Meta connector): Can implement PlatformConnector interface against ConnectorConfig and DecryptedCredentials types. packages/ingestion has facebook-nodejs-business-sdk installed.
- Plan 03 (Google Ads connector): google-ads-api installed and ready.
- Plan 04 (Shopify connector): @shopify/shopify-api installed and ready.
- Plan 05 (Scheduler): bullmq and ioredis installed. SyncJobData type defined for job payloads.
- Plan 06 (Normalization): NormalizedMetric type ready for normalizer implementations.
- A Drizzle migration must be generated and run before the integrations/sync_runs tables exist in Postgres. This is Plan 02-02's responsibility or should be handled early in Phase 2.

## Self-Check: PASSED

All created files verified present. All task commits verified in git log.

---
*Phase: 02-core-data-ingestion*
*Completed: 2026-02-24*
