---
phase: 03-statistical-engine
plan: "06"
subsystem: scoring-pipeline
tags: [bullmq, scoring, rollup, python-sidecar, stat-02, stat-04, stat-05, stat-07, arch-02, arch-03]
dependency_graph:
  requires: [03-01, 03-03, 03-04, 03-05]
  provides: [scoring-pipeline, hierarchy-rollup, weekly-refit, budget-change-trigger]
  affects: [04-dashboard, 05-geo-testing]
tech_stack:
  added: [scheduler/redis.ts]
  patterns: [spend-weighted-rollup, uncertainty-propagation, hierarchical-pooling, dual-score-output, bullmq-separate-queue]
key_files:
  created:
    - packages/ingestion/src/scoring/dispatch.ts
    - packages/ingestion/src/scoring/worker.ts
    - packages/ingestion/src/scoring/persist.ts
    - packages/ingestion/src/scoring/funnel-stage.ts
    - packages/ingestion/src/scoring/rollup.ts
    - packages/ingestion/src/scheduler/redis.ts
  modified:
    - packages/ingestion/src/scoring/index.ts
    - packages/ingestion/src/index.ts
    - packages/ingestion/src/scheduler/queues.ts
    - packages/ingestion/src/scheduler/workers.ts
    - packages/ingestion/src/scheduler/jobs/sync.ts
decisions:
  - "Separate 'scoring' BullMQ queue from 'ingestion' queue: Python model fitting is CPU-heavy and must not block data ingestion (concurrency=2 for scoring vs 3 for ingestion)"
  - "redisConnection extracted to scheduler/redis.ts to break circular dependency between queues.ts and scoring/dispatch.ts"
  - "Dynamic import() used in queues.ts enqueueScoringAfterSync to avoid static circular import at module load time"
  - "Rollup sentinel convention: campaignId='rollup:{level}:{groupKey}' uses deterministic pseudo-UUID for same table storage without JOIN overhead"
  - "Worker auto-fixes circular import via Rule 3: extracted shared redis connection to prevent runtime module resolution failures"
metrics:
  duration: "10 min"
  completed: "2026-02-24"
  tasks_completed: 3
  files_created: 6
  files_modified: 5
---

# Phase 3 Plan 06: TypeScript Scoring Orchestration Layer Summary

TypeScript scoring orchestration layer connecting Python FastAPI sidecar to BullMQ pipeline with spend-weighted 4-level hierarchy rollup, dual adjusted/raw score output, weekly model refit, and ARCH-03-gated nightly scoring trigger.

## Objective

Build the integration layer that makes all Python statistical models operational. Connects the data pipeline to Python endpoints, persists dual output, computes hierarchical rollups (STAT-02), implements weekly refit (STAT-07), triggers re-scoring on budget changes (STAT-04), and scaffolds market_id for STAT-05.

## Tasks Completed

### Task 1: Scoring dispatch, worker, and Python sidecar integration

**Commit:** `6ccf353`

**Files created:**
- `packages/ingestion/src/scoring/dispatch.ts` — `enqueueScoringJob`, `enqueueFullTenantScoring`, `registerWeeklyRefit` with cron `0 4 * * 0` for STAT-07
- `packages/ingestion/src/scoring/worker.ts` — `processScoringJob` calling `/forecast`, `/incrementality`, `/incrementality/pooled`, `/saturation`, `/anomalies` with 9-minute AbortSignal timeout
- `packages/ingestion/src/scoring/persist.ts` — `persistScores` inserting dual adjusted/raw rows + ARCH-02 modeled_* column updates
- `packages/ingestion/src/scoring/funnel-stage.ts` — `assignFunnelStage` mapping platform objectives to awareness/consideration/conversion
- `packages/ingestion/src/scoring/rollup.ts` — `spendWeightedRollup`, `computeHierarchyRollups`, `recomputeRollups` with STAT-05 scaffold

**Files modified:**
- `packages/ingestion/src/scoring/index.ts` — updated to re-export all new modules
- `packages/ingestion/src/index.ts` — added `export * from './scoring'`

**Key design decisions:**
- worker.ts reads `ANALYSIS_SERVICE_URL` from env (default `http://localhost:8000`)
- Minimum 30 data points threshold; borderline campaigns with cluster peers use `/incrementality/pooled`
- Only user-defined seasonal events queried for `user_events` in `ForecastRequest`; system events loaded by Python from retail_calendar.py
- `persistScores` inserts both `scoreType='adjusted'` and `scoreType='raw'` rows per campaign, updates `campaign_metrics.modeled_*` for last 30 days with adjusted values

### Task 2: Spend-weighted rollup with uncertainty propagation

**Commit:** `6ccf353` (included in Task 1 commit, required by index.ts)

**Key algorithms:**

`spendWeightedRollup()`:
- Spend-weighted average for `liftMean`: `Σ(lift_i * spend_i) / Σ(spend_i)`
- Variance propagation: `σ_i = (liftUpper_i - liftLower_i) / 4`, `propagated_variance = Σ(σ_i^2 * w_i^2)`
- Rollup half-width = `2 * √(propagated_variance)` — intervals WIDEN through hierarchy
- Confidence-weighted best estimate: `Σ(confidence_i * spend_i) / Σ(spend_i)` — always directional

`computeHierarchyRollups()`:
- Level 2 (Cluster): `${platform}_${funnelStage}` grouping (e.g., `meta_awareness`)
- Level 3 (Channel): `${platform}` grouping (e.g., `meta`)
- Level 4 (Overall): single aggregate
- Includes `scored` and `pooled_estimate` campaigns; excludes `insufficient_data` and `error`
- STAT-05 scaffold: `marketId` appended to group keys when non-null (Phase 5 geo-based testing)

`recomputeRollups()`:
- Queries latest adjusted score per campaign (DISTINCT ON scored_at DESC)
- Joins campaign platform/funnel_stage from campaigns table
- Aggregates 30-day spend from campaign_metrics
- Persists rollup rows with deterministic pseudo-UUID campaignId sentinel

### Task 3: Wire scoring into existing BullMQ infrastructure

**Commit:** `e446947`

**Files modified:**
- `packages/ingestion/src/scheduler/queues.ts` — added `scoringQueue` re-export, `enqueueScoringAfterSync`, `registerWeeklyRefitSchedule`
- `packages/ingestion/src/scheduler/workers.ts` — added `scoringWorker` (concurrency=2), budget change detection pre-step, rollup trigger after batch
- `packages/ingestion/src/scheduler/jobs/sync.ts` — added ARCH-03 gated scoring trigger after successful sync

**Files created:**
- `packages/ingestion/src/scheduler/redis.ts` — extracted `redisConnection` (circular dependency fix)

**Wiring details:**
- Scoring queue name: `'scoring'` (separate from `'ingestion'`)
- `score-campaign` → `processScoringJob` (individual campaign)
- `score-all-campaigns` → `enqueueFullTenantScoring` + budget change scan + rollup recompute
- ARCH-03 gate in sync.ts: reads `tenants.analysisUnlocked` before calling `enqueueScoringAfterSync`
- Graceful shutdown: `Promise.all([worker.close(), scoringWorker.close()])` on SIGTERM/SIGINT

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Circular import between queues.ts and dispatch.ts**
- **Found during:** Task 3 implementation
- **Issue:** `dispatch.ts` imports `redisConnection` from `scheduler/queues.ts`; `queues.ts` imports from `scoring/dispatch.ts`. Static circular imports cause module resolution failures at runtime in ESM (`type: "module"` packages).
- **Fix:** Extracted `redisConnection` to `scheduler/redis.ts`. Both `queues.ts` and `dispatch.ts` import from `redis.ts` (no cycle). Used dynamic `import()` in `enqueueScoringAfterSync` for the queue reference to avoid any remaining initialization ordering issues.
- **Files modified:** `scheduler/redis.ts` (created), `scheduler/queues.ts`, `scheduler/workers.ts`, `scoring/dispatch.ts`
- **Commit:** `e446947`

## Verification

- `npx tsc --noEmit --skipLibCheck -p packages/ingestion/tsconfig.json`: passes (only pre-existing TS2688 node types error from Phase 02)
- Scoring dispatch creates jobs on separate `'scoring'` queue (not `'ingestion'`)
- Worker calls Python sidecar at `ANALYSIS_SERVICE_URL` for all 4 endpoints
- Rollup produces cluster + channel + overall rollup scores (4-level hierarchy)
- Scoring triggered after sync completion with ARCH-03 gate enforced
- Weekly refit registered via `upsertJobScheduler` cron `0 4 * * 0` (STAT-07)
- Budget changes detected before batch scoring, targeted re-scoring enqueued (STAT-04)
- `marketId: null` scaffolded in all score inserts for Phase 5 (STAT-05)
- Graceful shutdown covers both ingestion and scoring workers

## Self-Check: PASSED

Files verified:
- `packages/ingestion/src/scoring/dispatch.ts`: FOUND
- `packages/ingestion/src/scoring/worker.ts`: FOUND
- `packages/ingestion/src/scoring/persist.ts`: FOUND
- `packages/ingestion/src/scoring/funnel-stage.ts`: FOUND
- `packages/ingestion/src/scoring/rollup.ts`: FOUND
- `packages/ingestion/src/scheduler/redis.ts`: FOUND

Commits verified:
- `6ccf353`: FOUND (Task 1 + Task 2 rollup)
- `e446947`: FOUND (Task 3)
