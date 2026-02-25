---
phase: 05-expanded-connectors-and-multi-market
plan: 03
subsystem: scoring, api
tags: [markets, scoring, attribution, rollup, sync, market-detection]

# Dependency graph
requires:
  - phase: 05-expanded-connectors-and-multi-market
    plan: 01
    provides: markets and campaign_markets tables, detectMarketsForTenant
  - phase: 03-statistical-engine
    provides: incrementality_scores table with marketId scaffold, scoring worker, rollup
provides:
  - Market confirmation API (GET/PUT) with confidence indicators and CRUD actions
  - Market detection trigger endpoint (POST)
  - Market-partitioned scoring in worker — marketId passed to persistScores
  - outcomeMode-aware metric mapping (lead_gen uses directConversions as revenue)
  - Market-level rollup aggregation in rollup hierarchy
  - Sync-triggered market re-detection for new campaigns
---

## What was built

### Task 1: Market confirmation API with detection trigger

Created two API routes:

**`apps/web/app/api/markets/route.ts` — GET + PUT:**
- GET returns markets for a tenant ordered by campaignCount DESC, serving as confidence indicators ("AU — 87 campaigns")
- PUT supports batch market actions: confirm (isConfirmed=true), rename (update displayName), merge (reassign campaign_markets to target, recalculate count, delete source), add (new market with isConfirmed=true), delete (reassign campaigns to NULL/Global, delete market)
- All operations via withTenant() for RLS

**`apps/web/app/api/markets/detect/route.ts` — POST:**
- Triggers detectMarketsForTenant() from Plan 01's market detection module
- Called during onboarding after ad accounts are connected, or on-demand to re-detect

### Task 2: Market-partitioned scoring in worker and rollup

**Scoring worker (`worker.ts`):**
- Queries campaign_markets for the campaign's marketId before scoring
- Checks tenant outcomeMode — for lead_gen tenants, maps directConversions to direct_revenue in MetricRow so the Python sidecar treats leads as the outcome variable
- Passes marketId to persistScores() so each score row has correct market assignment

**Persist (`persist.ts`):**
- Accepts optional `marketId` parameter (default null for backwards compatibility)
- Passes marketId to both adjusted and raw incrementality_scores inserts — fills the Phase 3 STAT-05 scaffold

**Rollup (`rollup.ts`):**
- Added market-level rollup between channel and overall levels
- Groups all campaigns in same market for cross-platform market aggregation
- Overall rollup remains as "All Markets" view aggregating across all markets

**Sync (`sync.ts`):**
- After successful sync with records ingested, triggers detectMarketsForTenant() for Meta and Google Ads platforms
- Ensures new campaigns get market assignments before scoring partitions by market
- Non-fatal: market detection failure doesn't block sync success

## Key files

### Created
- `apps/web/app/api/markets/route.ts` — Market CRUD API
- `apps/web/app/api/markets/detect/route.ts` — Detection trigger

### Modified
- `packages/ingestion/src/scoring/worker.ts` — Market query + outcomeMode + marketId passthrough
- `packages/ingestion/src/scoring/persist.ts` — marketId parameter on persistScores
- `packages/ingestion/src/scoring/rollup.ts` — Market-level rollup aggregation
- `packages/ingestion/src/scheduler/jobs/sync.ts` — Market re-detection on new campaigns

## Deviations

None. All plan tasks implemented as specified.

## Duration

~8 min (including orchestrator retry)
