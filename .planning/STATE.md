# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.
**Current focus:** Phase 2 - Core Data Ingestion (IN PROGRESS)

## Current Position

Phase: 2 of 6 (Core Data Ingestion) - IN PROGRESS
Plan: 1 of 6 in current phase - COMPLETE
Status: Phase 2 Plan 01 complete — integrations/sync_runs schema tables, packages/ingestion scaffold, AES-256-GCM crypto, PlatformConnector interface
Last activity: 2026-02-24 — Completed Plan 01: integrations/sync_runs Drizzle schema with RLS, packages/ingestion with Meta/Google/Shopify SDKs, token encryption, connector contract

Progress: [███░░░░░░░] 25%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 3.3 min
- Total execution time: 0.2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-data-architecture | 2 | 7 min | 3.5 min |
| 02-core-data-ingestion | 1 | 3 min | 3 min |

**Recent Trend:**
- Last 5 plans: 4 min, 3 min, 3 min
- Trend: stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Statistical modeling as primary methodology (not holdout-first)
- Scaling-first recommendations over holdout-first
- CRM-first for lead gen (not GA4 as primary)
- Creative analysis: architecture only in v1, no UI
- Dual attribution layers: direct + modeled shown side by side
- 4 CRMs in v2 (HubSpot, Salesforce, GHL, Zoho deferred from v1)
- Auth deferred to Phase 6 — schema-first approach means data architecture is built before auth is wired in
- No UUID primary key on campaignMetrics — TimescaleDB hypertable uses uniqueIndex on (tenantId, campaignId, date, source)
- tenants table has NO RLS — root of isolation hierarchy, access controlled by application auth
- appRole declared as .existing() — created by infra/DBA, not managed by Drizzle migrations
- Migration file keeps drizzle-kit generated name (0000_aberrant_namora.sql) — renaming breaks _journal.json
- FORCE ROW LEVEL SECURITY appended to init migration (not separate file) — atomic with table creation
- Continuous aggregate deferred to Phase 3 — modeled_* columns NULL until statistical engine runs
- Bare imports (no .js extension) in schema files — drizzle-kit bundler requires TypeScript resolution
- packages/ingestion package type is 'module' with exports pointing to ./src/index.ts — matches packages/db pattern
- AES-256-GCM iv+authTag+ciphertext wire format — getKey() reads TOKEN_ENCRYPTION_KEY at call time so missing env var throws on use, not on import
- PlatformConnector defined as interface (not abstract class) — duck typing allows simpler mock implementations in tests
- NormalizedMetric numeric fields are string type — matches Drizzle numeric() column insert shape

### Pending Todos

- Generate and run Drizzle migration for integrations and sync_runs tables before Plan 02 connectors can run against a real DB

### Blockers/Concerns

- CausalPy production readiness is LOW confidence — verify before committing to this library. Fallback: causalimpact (Python port of Google's BSTS R library) or raw PyMC.
- Ad platform API rate limits in research are from training data — verify current Meta, Google limits against live developer docs before designing ingestion queue.
- Better Auth organization/role model needs verification that it supports all four required role levels before Phase 6 scaffold commits.
- TimescaleDB availability on Railway — plan for custom Docker image. Verify before infrastructure provisioning.
- app_user PostgreSQL role must be created by DBA/infra before migrations run — not managed by Drizzle.
- TOKEN_ENCRYPTION_KEY env var must be set before packages/ingestion crypto module is usable — 32 bytes as 64 hex chars

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 02-01-PLAN.md — integrations/sync_runs Drizzle schema with RLS, packages/ingestion scaffold with Meta/Google/Shopify SDKs, AES-256-GCM token encryption, PlatformConnector interface contract.
Resume file: None
