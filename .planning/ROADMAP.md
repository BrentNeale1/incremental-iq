# Roadmap: Incremental IQ

## Overview

Six phases deliver campaign-level incremental lift analysis from a schema-first foundation through to a fully actionable, dual-audience analytics product with secure access. Phase 1 establishes the data architecture that all subsequent phases write into — schema design, RLS-based tenant isolation, and dual attribution layers. Phase 2 pumps real ad platform and revenue data through a validated ingestion pipeline. Phase 3 runs the statistical engine for the first time and produces incrementality scores. Phase 4 converts those scores into scaling-first recommendations and a usable dashboard. Phase 5 closes out the connector surface with GA4 and adds multi-market attribution to prevent cross-market false signals. Phase 6 adds user authentication and account management on top of the completed product.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Data Architecture** - Multi-tenant schema with RLS, dual attribution layers, and creative metadata ready for campaign data
- [x] **Phase 2: Core Data Ingestion** - Meta Ads, Google Ads, and Shopify data flowing through the pipeline with historical backfill
- [ ] **Phase 3: Statistical Engine** - Baseline forecasting, incrementality scoring, confidence intervals, and seasonality detection running
- [ ] **Phase 4: Recommendations and Dashboard** - Scaling-first recommendations and dual-audience dashboard surfacing model outputs to users
- [ ] **Phase 5: Expanded Connectors and Multi-Market** - GA4 integration, market auto-detection, and market-aware attribution
- [ ] **Phase 6: Authentication** - User sign-up, login with session persistence, and logout across the platform

## Phase Details

### Phase 1: Data Architecture
**Goal**: The data schema is designed, deployed, and enforces tenant isolation — ready to accept campaign data from any connected integration
**Depends on**: Nothing (first phase)
**Requirements**: ARCH-01, ARCH-02, ARCH-03
**Success Criteria** (what must be TRUE):
  1. Database schema enforces tenant isolation at the row level — no application-level filter can expose one tenant's data to another
  2. Schema stores both direct (trackable) and modeled (estimated) attribution values side by side in the same record structure
  3. Creative-level metadata fields exist in the schema and are ready to accept creative data without a migration in v2
**Plans**: 2 plans
Plans:
- [x] 01-01-PLAN.md — Schema foundation: packages/db scaffold, all schema tables with RLS, dual attribution, creative metadata
- [x] 01-02-PLAN.md — Migrations: Drizzle migration generation, TimescaleDB hypertable conversion, migration runner

### Phase 2: Core Data Ingestion
**Goal**: Real campaign spend data from Meta Ads and Google Ads, and real revenue data from Shopify, are flowing through the pipeline with at least one year of historical backfill
**Depends on**: Phase 1
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-05
**Success Criteria** (what must be TRUE):
  1. User can connect a Meta Ads account via OAuth and see campaign, ad set, and ad data appear in the system
  2. User can connect a Google Ads account via OAuth and see campaign data appear in the system
  3. User can connect a Shopify store and see order and revenue data appear as the outcome variable (not ad platform conversion counts)
  4. System automatically backfills historical data up to 3 years for all connected sources, with a visible minimum of 1 year before analysis is unlocked
  5. Each connected integration shows a data freshness indicator so the user knows when data was last synced
**Plans**: 6 plans
Plans:
- [x] 02-01-PLAN.md — Schema additions (integrations, sync_runs) + packages/ingestion scaffold with shared utilities
- [x] 02-02-PLAN.md — apps/web Next.js scaffold, Drizzle migration, OAuth routes for Meta/Google/Shopify
- [x] 02-03-PLAN.md — Meta Ads connector and normalizer (two-stage raw-to-normalized pipeline)
- [x] 02-04-PLAN.md — Google Ads connector and normalizer (GAQL queries, cost_micros conversion)
- [x] 02-05-PLAN.md — Shopify connector and normalizer (bulk operations for backfill, direct attribution)
- [x] 02-06-PLAN.md — BullMQ scheduler, backfill worker, manual sync, freshness API endpoints

### Phase 3: Statistical Engine
**Goal**: The system produces campaign-level incrementality scores with confidence intervals, backed by a baseline forecast, seasonality decomposition, and saturation curve modeling
**Depends on**: Phase 2
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, STAT-06, STAT-07, SEAS-01, SEAS-02
**Success Criteria** (what must be TRUE):
  1. System produces a baseline forecast for each campaign derived from historical data, with the model visibly improving as more data accumulates over time
  2. Campaign-level incrementality scores roll up to cluster, channel, and overall levels — user can see the score at any level of the hierarchy
  3. Every prediction and incrementality score displays a confidence interval, not a single point estimate
  4. When a budget change is detected, the system performs a pre/post time-series analysis and surfaces the result
  5. System detects seasonal patterns and anomalies from historical data and maps campaigns against a pre-loaded retail event calendar (BFCM, Christmas, etc.)
**Plans**: 6 plans
Plans:
- [ ] 03-01-PLAN.md — Schema additions: incrementality_scores, seasonal_events, budget_changes, saturation_estimates tables + funnelStage column + migration
- [x] 03-02-PLAN.md — Python FastAPI sidecar scaffold (packages/analysis) with Pydantic schemas, retail event calendar, Dockerfile
- [ ] 03-03-PLAN.md — Prophet baseline forecasting with seasonal holiday injection and confidence intervals (TDD)
- [ ] 03-04-PLAN.md — CausalPy incrementality scoring (ITS) and Hill function saturation curve modeling (TDD)
- [ ] 03-05-PLAN.md — STL anomaly detection and TypeScript budget change detection
- [ ] 03-06-PLAN.md — Scoring orchestration worker, spend-weighted hierarchy rollup, weekly refit schedule

### Phase 4: Recommendations and Dashboard
**Goal**: Users can view a dual-audience dashboard that surfaces scaling-first recommendations with transparent confidence, and can export their data
**Depends on**: Phase 3
**Requirements**: RECC-01, RECC-02, RECC-03, RECC-04, RECC-05, RECC-06, RPRT-01, RPRT-02, RPRT-03, RPRT-04, RPRT-05, RPRT-06, RPRT-07
**Success Criteria** (what must be TRUE):
  1. Default recommendation shown to user is a scale-up suggestion ("increase Campaign X budget by Y% for Z weeks"), never a holdout pause — holdout test design is available only when statistical confidence is insufficient
  2. Business owner view shows a single-line summary estimate; analyst view shows confidence ranges, p-values, and methodology detail — both generated from identical underlying data
  3. When confidence is too low to recommend, the system states this transparently and suggests specific tests or data collection steps to resolve the gap
  4. Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %) with date range selection (7/14/30/90 days, custom, comparison period) and a multi-level campaign-to-channel drill-down view
  5. User can export all visible data as CSV or Excel, and the UI is fully usable on a mobile browser
**Plans**: TBD

### Phase 5: Expanded Connectors and Multi-Market
**Goal**: Users running lead gen businesses can connect GA4 as an outcome source, and all users get market-segmented attribution that prevents cross-market false signals
**Depends on**: Phase 4
**Requirements**: INTG-04, MRKT-01, MRKT-02, MRKT-03, MRKT-04
**Success Criteria** (what must be TRUE):
  1. User can connect GA4 and select which conversion events represent leads, with those leads used as the outcome variable for analysis
  2. System auto-detects markets from campaign geo targeting metadata and presents them to the user for confirmation or correction during onboarding
  3. Attribution model isolates market signals — a US spend spike does not produce a false lift signal against AU revenue
  4. All reports and analysis views can be segmented by market
**Plans**: TBD

### Phase 6: Authentication
**Goal**: Users can create accounts, log in with persistent sessions, and log out securely from anywhere in the platform
**Depends on**: Phase 5
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can create an account with email and password and access the platform
  2. User can log in and remain logged in across browser refreshes without re-authenticating
  3. User can log out from any page and their session is immediately invalidated
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Architecture | 2/2 | Complete | 2026-02-24 |
| 2. Core Data Ingestion | 6/6 | Complete    | 2026-02-24 |
| 3. Statistical Engine | 2/6 | In Progress|  |
| 4. Recommendations and Dashboard | 0/TBD | Not started | - |
| 5. Expanded Connectors and Multi-Market | 0/TBD | Not started | - |
| 6. Authentication | 0/TBD | Not started | - |
