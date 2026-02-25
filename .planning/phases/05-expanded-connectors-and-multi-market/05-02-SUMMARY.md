---
phase: 05-expanded-connectors-and-multi-market
plan: 02
subsystem: api
tags: [ga4, google-analytics, oauth, connector, normalizer, lead-gen]

# Dependency graph
requires:
  - phase: 02-core-data-ingestion
    provides: Two-stage raw-to-normalized pipeline pattern, PlatformConnector interface, AES-256-GCM token encryption, withTenant RLS helper, saveIntegration OAuth helper, campaign_metrics schema with directConversions column
provides:
  - GA4Connector with listProperties, listKeyEvents, fetchLeadCounts, refreshTokenIfNeeded
  - processGA4Sync normalizer: two-stage pipeline storing lead counts in directConversions
  - GA4 OAuth initiation at GET /api/oauth/ga4 (analytics.readonly scope)
  - GA4 OAuth callback at GET /api/oauth/ga4/callback (platform='ga4' integration)
  - GA4 properties endpoint at GET /api/ga4/properties (with autoSelected flag)
  - GA4 events endpoint at GET/POST /api/ga4/events (list + save event selections)
affects:
  - 05-03-PLAN (market detection)
  - 05-04-PLAN (GA4 UI components - GA4EventSelector, GA4 onboarding flow)
  - 05-05-PLAN (market-segmented reporting - must handle GA4 as outcome source)

# Tech tracking
tech-stack:
  added:
    - "@google-analytics/admin@9.0.1 — Admin API client (listKeyEventsAsync)"
    - "@google-analytics/data@5.2.1 — Data API client (runReport for daily event counts)"
    - "google-auth-library — OAuth2Client for auth injection to GA4 clients"
  patterns:
    - GA4Connector as outcome-source connector (not PlatformConnector) — separate getGA4Connector() factory
    - GA4 date normalization: YYYYMMDD → YYYY-MM-DD via regex in fetchLeadCounts
    - Single runReport with inListFilter for all selected events (quota-safe batch)
    - Synthetic ga4-leads campaign per tenant (mirrors shopify-revenue pattern)
    - processGA4Sync two-stage: storeGA4RawPull → normalizeGA4Events → ingestion_coverage

key-files:
  created:
    - packages/ingestion/src/connectors/ga4.ts
    - packages/ingestion/src/normalizers/ga4.ts
    - apps/web/app/api/oauth/ga4/route.ts
    - apps/web/app/api/oauth/ga4/callback/route.ts
    - apps/web/app/api/ga4/properties/route.ts
    - apps/web/app/api/ga4/events/route.ts
  modified:
    - packages/ingestion/src/connectors/index.ts
    - packages/ingestion/src/types.ts
    - packages/ingestion/src/index.ts
    - packages/ingestion/package.json

key-decisions:
  - "GA4Connector does NOT implement PlatformConnector — it is an outcome source, not an ad platform. Separate getGA4Connector() factory in connector index; Platform type extended to include 'ga4' but existing getConnector() only accepts AdPlatform (excludes ga4)"
  - "GA4 date normalization in fetchLeadCounts (connector), not normalizer — date Map keys are already ISO before normalizeGA4Events receives them"
  - "Single runReport call with inListFilter for all selected event names — one API call per sync, not one per event (RESEARCH.md Pitfall 2 quota management)"
  - "Synthetic 'ga4-leads' campaign per tenant (source='ga4', externalId='ga4-leads') — mirrors shopify-revenue pattern from Phase 2"
  - "Lead counts stored in directConversions column (not directRevenue) — GA4 is lead-gen outcome source (RESEARCH.md Pattern 10)"
  - "No backfill triggered from OAuth callback — requires property + event selection first (selectedEventNames empty would produce no-op sync)"
  - "tokenExpiresAt stored as ISO string in integration.metadata — same pattern as Shopify (Dec 2025); 5-minute refresh buffer in refreshTokenIfNeeded"
  - "google-auth-library added as direct dependency to packages/ingestion — GA4 admin/data clients require OAuth2Client for auth injection; transitive deps not resolvable by TypeScript"

patterns-established:
  - "Outcome source connector pattern: GA4Connector has listProperties/listKeyEvents/fetchLeadCounts instead of fetchCampaigns/fetchMetrics; registered via separate getGA4Connector() not getConnector()"
  - "GA4 event selection before backfill: OAuth callback saves empty selectedEventNames; worker checks before pulling data"

requirements-completed:
  - INTG-04

# Metrics
duration: 12min
completed: 2026-02-25
---

# Phase 05 Plan 02: GA4 Connector and OAuth Flow Summary

**GA4 lead-gen data pipeline: OAuth flow with analytics.readonly scope, property selection, key event listing via Admin API listKeyEventsAsync, and daily lead counts via Data API runReport with YYYYMMDD-to-ISO date normalization**

## Performance

- **Duration:** 12 min
- **Started:** 2026-02-25T00:53:04Z
- **Completed:** 2026-02-25T01:05:28Z
- **Tasks:** 2
- **Files modified:** 9 files (6 created, 3 modified)

## Accomplishments
- GA4Connector with listProperties, listKeyEvents, fetchLeadCounts (single-request with inListFilter), refreshTokenIfNeeded
- processGA4Sync two-stage normalizer: storeGA4RawPull → normalizeGA4Events → ingestion_coverage; synthetic ga4-leads campaign; lead counts in directConversions
- GA4 OAuth flow: GET /api/oauth/ga4 (analytics.readonly), callback saves platform='ga4' with empty metadata awaiting selection
- Properties endpoint with autoSelected flag for single-property accounts (RESEARCH.md Pitfall 5)
- Events endpoint: GET lists key events via listKeyEventsAsync (not deprecated conversionEvents); POST saves propertyId + selectedEventNames

## Task Commits

Each task was committed atomically:

1. **Task 1: GA4 connector with Admin API and Data API clients** - `50680b0` (feat)
2. **Task 2: GA4 OAuth routes and event/property API endpoints** - `81e49b3` (feat)

## Files Created/Modified
- `packages/ingestion/src/connectors/ga4.ts` - GA4Connector class: listProperties, listKeyEvents, fetchLeadCounts (YYYYMMDD→ISO), refreshTokenIfNeeded
- `packages/ingestion/src/normalizers/ga4.ts` - processGA4Sync orchestrator, storeGA4RawPull, ensureGA4SyntheticCampaign, normalizeGA4Events (directConversions)
- `packages/ingestion/src/connectors/index.ts` - Added getGA4Connector() factory; kept getConnector() for AdPlatform only
- `packages/ingestion/src/types.ts` - Extended Platform type to include 'ga4'
- `packages/ingestion/src/index.ts` - Exported GA4Connector and GA4Property/GA4KeyEvent types
- `packages/ingestion/package.json` - Added @google-analytics/admin, @google-analytics/data, google-auth-library
- `apps/web/app/api/oauth/ga4/route.ts` - GET: OAuth initiation with analytics.readonly scope
- `apps/web/app/api/oauth/ga4/callback/route.ts` - GET: token exchange, saveIntegration(platform='ga4')
- `apps/web/app/api/ga4/properties/route.ts` - GET: list GA4 properties with autoSelected flag
- `apps/web/app/api/ga4/events/route.ts` - GET: list key events; POST: save property + event selections

## Decisions Made

- GA4Connector is NOT a PlatformConnector — it is an outcome source with a different method surface. Implemented a separate `getGA4Connector()` factory function in connectors/index.ts to keep the typed `getConnector()` interface for ad platforms intact. Extended `Platform` type with 'ga4' for DB column compatibility, but `getConnector()` uses `AdPlatform = Exclude<Platform, 'ga4'>`.
- GA4 date normalization happens in the connector (fetchLeadCounts), not the normalizer. The Map returned already uses ISO dates — normalizer never sees YYYYMMDD format.
- No backfill triggered from OAuth callback. The processGA4Sync normalizer returns `{ recordsIngested: 0, datesProcessed: 0 }` early if selectedEventNames is empty, making a premature backfill a safe no-op. Proper backfill trigger belongs in Plan 06 scheduler after event selection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added google-auth-library as direct dependency**
- **Found during:** Task 1 (GA4 connector implementation)
- **Issue:** @google-analytics/admin and @google-analytics/data require OAuth2Client from google-auth-library for auth injection; TypeScript could not resolve it as a transitive dep
- **Fix:** Added google-auth-library as direct dep to packages/ingestion via pnpm
- **Files modified:** packages/ingestion/package.json, pnpm-lock.yaml
- **Verification:** `npx tsc --noEmit --skipLibCheck` passes for src/connectors/ga4.ts
- **Committed in:** 50680b0 (Task 1 commit)

**2. [Rule 1 - Bug] Separated GA4Connector from PlatformConnector registry to avoid type breakage**
- **Found during:** Task 1 (connector index update)
- **Issue:** Adding GA4Connector to `getConnector()` with `PlatformConnector | GA4Connector` return type broke all existing normalizers that call `fetchCampaigns` and `fetchMetrics` on the result
- **Fix:** Kept `getConnector()` typed for `AdPlatform` (excludes 'ga4'); added separate `getGA4Connector()` that returns GA4Connector singleton
- **Files modified:** packages/ingestion/src/connectors/index.ts
- **Verification:** `npx tsc --noEmit --skipLibCheck` shows no new errors in existing normalizers
- **Committed in:** 50680b0 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. Spirit of plan preserved — GA4 connector is accessible from the registry via getGA4Connector(). No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

GA4 OAuth requires external configuration before the flow works:

**Environment variables to add:**
- `GA4_CLIENT_ID` — Google OAuth client ID (can reuse same Google Cloud project as Google Ads, but separate credentials for GA4 scope)
- `GA4_CLIENT_SECRET` — Google OAuth client secret

**Google Cloud Console steps:**
1. Enable "Google Analytics Data API" in APIs & Services > Library
2. Enable "Google Analytics Admin API" in APIs & Services > Library
3. Add `analytics.readonly` scope to OAuth consent screen (or create new OAuth credentials)
4. Add `/api/oauth/ga4/callback` as an authorized redirect URI

## Next Phase Readiness
- GA4 data pipeline complete — backend ready to pull lead counts once users connect and select events
- Plan 04 (GA4 UI) can build GA4EventSelector and property selection components on top of these endpoints
- Plan 06 scheduler should trigger GA4 backfill after event selection is saved (POST /api/ga4/events)
- Prerequisite for lead-gen analytics: tenant.outcomeMode = 'lead_gen' gates (Plan 03 or later)

## Self-Check: PASSED

All created files verified on disk:
- packages/ingestion/src/connectors/ga4.ts: FOUND
- packages/ingestion/src/normalizers/ga4.ts: FOUND
- apps/web/app/api/oauth/ga4/route.ts: FOUND
- apps/web/app/api/oauth/ga4/callback/route.ts: FOUND
- apps/web/app/api/ga4/properties/route.ts: FOUND
- apps/web/app/api/ga4/events/route.ts: FOUND

All commits verified:
- 50680b0 (Task 1: GA4 connector and normalizer): FOUND
- 81e49b3 (Task 2: GA4 OAuth routes and API endpoints): FOUND

All plan requirements verified:
- analytics.readonly scope in OAuth initiation: PASS
- platform='ga4' in callback saveIntegration: PASS
- listKeyEventsAsync used (not deprecated conversionEvents): PASS
- YYYYMMDD→YYYY-MM-DD date conversion: PASS
- directConversions for lead counts: PASS
- getGA4Connector in connector registry: PASS

---
*Phase: 05-expanded-connectors-and-multi-market*
*Completed: 2026-02-25*
