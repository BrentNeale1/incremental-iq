# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.
**Current focus:** Phase 1 - Data Architecture

## Current Position

Phase: 1 of 6 (Data Architecture)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-02-24 — Roadmap revised to 6 phases; Phase 1 narrowed to data architecture (ARCH-01/02/03); authentication split into new Phase 6 (AUTH-01/02/03)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

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

### Pending Todos

None yet.

### Blockers/Concerns

- CausalPy production readiness is LOW confidence — verify before committing to this library. Fallback: causalimpact (Python port of Google's BSTS R library) or raw PyMC.
- Ad platform API rate limits in research are from training data — verify current Meta, Google limits against live developer docs before designing ingestion queue.
- Better Auth organization/role model needs verification that it supports all four required role levels before Phase 6 scaffold commits.

## Session Continuity

Last session: 2026-02-24
Stopped at: Roadmap revised from 5 to 6 phases. Phase 1 is now Data Architecture only. Phase 6 is Authentication. All 37 v1 requirements remain mapped. Ready to plan Phase 1.
Resume file: None
