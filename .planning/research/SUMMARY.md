# Project Research Summary

**Project:** Incremental IQ — Incremental Lift Measurement Platform
**Domain:** Marketing analytics SaaS — causal incrementality measurement for paid digital advertising
**Researched:** 2026-02-24
**Confidence:** MEDIUM

## Executive Summary

Incremental IQ is a statistical analytics SaaS that measures true incrementality (causal lift) of paid advertising campaigns at the campaign level — a granularity no current competitor publicly offers. The platform must ingest spend data from ad platforms (Meta, Google, TikTok, Snapchat) and outcome data from Shopify or CRMs, apply causal inference models (Bayesian Structural Time Series, difference-in-differences, synthetic controls), and surface results in dual views: simplified summaries for business owners and full statistical detail for analysts. The recommended architecture is a layered analytics pipeline with a Python FastAPI statistical service running as a separate container alongside a Next.js web application, backed by PostgreSQL with the TimescaleDB extension for time-series performance. The Python service is non-negotiable — the statistical complexity (causal inference, saturation curve modeling, seasonality decomposition) exceeds what any JavaScript statistical library can handle.

The primary market differentiation is campaign-level incrementality scoring with a scaling-first philosophy — recommending spend increases rather than holdout pauses. No current competitor publicly markets campaign-level granularity as a primary feature; Measured, Rockerbox, Recast, and Northbeam all operate at the channel level. The dual-audience reporting requirement (same underlying data, two views) and the CRM-first lead gen model (actual leads, not GA4 proxy conversions) are secondary differentiators. For MVP, the statistical engine's accuracy and trustworthiness matters more than breadth of integrations — a confident, correct recommendation on two channels beats mediocre coverage of six channels.

The highest risks are in the statistical engine layer. Three categories of failure threaten the core value proposition: (1) confusing correlation with causality in the model — the fix is proper causal inference frameworks from day one; (2) using ad platform-reported conversions as the outcome variable — the fix is treating Shopify/CRM data as the only valid target variable; and (3) cross-market signal contamination — the fix is mandatory geo-segmentation enforced at the data ingestion layer, not the analysis layer. Multi-tenant data isolation is a mandatory security foundation that cannot be retrofitted safely. All five critical pitfalls require architectural decisions before the first line of feature code is written.

---

## Key Findings

### Recommended Stack

The stack centers on a TypeScript monorepo (Turborepo) with three deployable services: a Next.js 15 web application, a Python FastAPI statistical service, and a BullMQ worker process for background data ingestion. PostgreSQL 16 with TimescaleDB provides time-series-optimized storage without the operational overhead of a separate OLAP system at MVP scale. Drizzle ORM is preferred over Prisma because it exposes TimescaleDB-specific SQL functions directly and provides full query transparency. Better Auth handles multi-tenant authentication (organizations/roles) at lower cost than Clerk's per-MAU pricing. The entire stack deploys on Railway, which natively supports multi-service projects with custom Docker images (required for the Python service). All services are containerized; the Python statistical service cannot be serverless due to model cold-start times (30-120 seconds for Bayesian inference).

The Python statistical service uses statsmodels for ARIMA/SARIMA/VAR models, Prophet for seasonality decomposition, scipy for p-value and confidence interval calculation, and CausalPy (PyMC-backed) for Bayesian causal impact analysis. This library selection is matched to the specific statistical requirements: STL/Prophet decomposition before incrementality modeling, saturation curve estimation, and geo-based synthetic control methods. CausalPy is the only LOW confidence recommendation — it is relatively new and production readiness should be verified before committing.

**Core technologies:**
- **Next.js 15 + React 19:** Full-stack framework — App Router handles auth-gated app, API routes, and static marketing in one deployment
- **TypeScript 5:** Shared types across frontend and API layer — prevents integration bugs with complex statistical output shapes
- **PostgreSQL 16 + TimescaleDB 2:** Primary datastore — RLS for multi-tenant isolation, hypertables for time-series partitioning, continuous aggregates replace a separate caching layer
- **Drizzle ORM:** Database access — raw SQL transparency for TimescaleDB functions; Prisma's abstraction works against this use case
- **Python FastAPI:** Statistical service — the entire Python scientific ecosystem (statsmodels, Prophet, scipy, CausalPy) is non-negotiable for this statistical complexity
- **BullMQ + Redis 7:** Background job queue — four queues (ingestion, analysis, notification, scheduler) with rate limiting critical for ad platform API constraints
- **Better Auth 1.x:** Multi-tenant auth — organization/role model without Clerk's prohibitive per-MAU pricing at agency scale
- **shadcn/ui + Tailwind CSS 4 + Recharts:** Frontend — full control for dual-audience view toggles; Recharts for confidence interval shaded regions and lift charts
- **Railway:** Deployment — multi-service project with custom Docker images; Vercel is incompatible with long-running statistical jobs and persistent BullMQ workers

### Expected Features

See `FEATURES.md` for the full competitive analysis and feature dependency graph.

**Must have (table stakes):**
- Ad platform integrations (Meta + Google minimum) — no data, no product
- Revenue/conversion data ingestion (Shopify for ecommerce; CRM for lead gen) — outcome data required for incrementality
- Campaign-level incrementality scores with confidence intervals — the core product deliverable
- Dashboard with summary KPIs and date range selection — expected baseline analytics UX
- Historical data import (1-3 year backfill) — required before model can run
- Confidence thresholds with resolution suggestions — establishes trust; prevents acting on low-confidence scores
- Onboarding/data connection flow with market confirmation — multi-step OAuth + geo validation
- Multi-tenant architecture with RBAC — agencies are likely first customers; retrofit is painful
- Data freshness indicators and notification/alert system — users need to know when data is current
- CSV export, mobile-responsive UI — table stakes for analytics SaaS

**Should have (competitive differentiators):**
- Campaign-level incrementality scoring (not just channel level) — no current competitor offers this as primary feature
- Scaling-first recommendations ("increase by X% for Y weeks") — counters industry default of holdout pauses that hurt brands
- Dual-audience reporting (owner summary / analyst detail from identical data) — prevents trust issues from view divergence
- Seasonality detection with user confirmation loop — brand-specific patterns, not just generic retail calendar
- Proactive budget adjustment suggestions driven by seasonality forecasts
- Multi-market auto-detection from campaign geo targets — prevents cross-market false signals
- CRM-first lead gen model (HubSpot, Salesforce, GoHighLevel, Zoho) — actual leads, not GA4 proxy conversions
- Holdout test design assistant as fallback when statistical confidence is insufficient
- Model maturity progress indicator ("14 months of 36 recommended") — manages expectations and creates lock-in

**Defer (v2+):**
- TikTok and Snapchat integrations — add after Meta + Google are stable
- WooCommerce integration — Shopify first; WooCommerce in v2
- Creative-level analysis UI — store schema in v1; surface UI in v2
- LTV prediction — separate modeling problem; explicitly out of scope
- Traditional media, organic/SEO, last-click/MTA attribution — different product surface, dilutes focus

### Architecture Approach

The platform follows a layered analytics pipeline pattern: external APIs feed a connector ingestion layer that writes raw immutable records to a landing zone, a normalization layer transforms these into a unified schema tagged with market/geo metadata and tenant isolation, a TimescaleDB-backed analytics database stores time-series facts and materialized aggregates, a Python statistical engine computes baselines/incrementality/confidence/seasonality asynchronously via job queue, a recommendation engine converts model outputs to ranked budget suggestions, and a dual-view presentation layer serves the same underlying data in owner-summary and analyst-detail representations. Multi-tenancy is enforced at the database layer via PostgreSQL RLS, not just application-level filtering.

**Major components:**
1. **Connector Workers + Credential Vault** — authenticate with 11+ external APIs, rate-limited polling, OAuth token management per tenant
2. **Raw Landing Zone + Normalization Layer** — immutable append-only raw storage; separate normalization step allows schema re-processing without re-fetching from APIs
3. **Analytics DB (TimescaleDB)** — normalized time-series facts, materialized aggregates, seasonality event registry as a first-class entity
4. **Python Statistical Engine (FastAPI)** — baseline forecasting, incrementality scoring, saturation curve estimation, confidence intervals, seasonality decomposition
5. **Recommendation Engine** — converts model outputs to scaled dollar recommendations with confidence bands; enforces suppression below confidence threshold
6. **API Layer + Auth/RBAC** — tenant-scoped data access, four role levels (agency-admin, specialist, client-owner, brand-owner)
7. **Dual-View Frontend** — owner view (business language) and analyst view (statistics), generated from identical underlying data

Key patterns enforced throughout: immutable raw landing zone (re-process without re-fetching), tenant-isolated RLS on every client data table, async computation for all jobs over 2 seconds, connector abstraction interface (add new sources without touching orchestration logic), and seasonality registry as first-class entity (not hard-coded logic).

### Critical Pitfalls

1. **Correlation mistaken for causality in the model** — Use BSTS, MMM with saturation curves, or DID with proper control selection from day one. A naive regression on spend vs. revenue will produce recommendations that fail in the field and destroy trust. This must be architectural, not a post-launch fix. (PITFALLS.md Pitfall 1)

2. **Ad platform conversions used as outcome variable** — Platform-reported conversions are systematically inflated and double-counted across channels. Sum of Meta + Google + TikTok attributed revenue routinely exceeds actual revenue by 2-5x. Shopify order data or CRM qualified leads are the ONLY valid target variables. Build the data pipeline to enforce this boundary explicitly. (PITFALLS.md Pitfall 2)

3. **Cross-market signal contamination** — Without campaign geo target → revenue market mapping enforced at the data ingestion layer, US spend correlates with AU revenue and produces false incrementality scores. Geo segmentation is a model integrity requirement, not a UX nicety — it must gate the first analysis run. (PITFALLS.md Pitfall 3)

4. **Seasonality false positives without brand-specific decomposition** — Generic retail seasonality (BFCM) causes lift to be attributed to campaigns that simply ran during seasonal peaks. STL or Prophet decomposition must be applied to the time series before the incrementality model runs — the model operates on residuals, not raw revenue. (PITFALLS.md Pitfall 4)

5. **Multi-tenant data isolation implemented only at application layer** — A single bug in a WHERE clause can expose one tenant's data to another. PostgreSQL RLS policies at the database layer provide defense-in-depth that cannot be bypassed by application code. RLS must be established before any client data enters the database. (PITFALLS.md Pitfall 8)

---

## Implications for Roadmap

Based on the combined research, the feature dependency graph in FEATURES.md, and the component build order in ARCHITECTURE.md, the following phase structure is recommended. The architecture research explicitly maps out 8 build phases; this synthesis translates those into product-delivery phases.

### Phase 1: Foundation and Statistical Engine Design

**Rationale:** Five critical pitfalls require architectural decisions before any feature code. The statistical engine design (causal inference framework, saturation curves, seasonality decomposition, market segmentation) cannot be retrofitted — it determines whether recommendations are trustworthy. Multi-tenant schema with RLS must be established before any data enters the system. This phase has no deliverable to end users but gates everything downstream.

**Delivers:** Monorepo scaffold, database schema with RLS and tenant isolation, Python FastAPI statistical service skeleton with model interfaces defined, Drizzle schema for time-series facts, connector abstraction interface, auth system with organization/role model.

**Addresses:** Auth, user accounts, multi-tenant architecture (FEATURES.md table stakes); agency/multi-tenant architecture (FEATURES.md differentiator)

**Avoids:** Multi-tenant data isolation failures (Pitfall 8), correlation-causality confusion baked into the wrong model architecture (Pitfall 1), platform conversions used as outcome variable (Pitfall 2 — enforced at schema level by separating `platform_reported_conversions` from target variable)

**Research flag:** Needs phase research — statistical model selection (BSTS vs. synthetic control vs. DID), saturation curve implementation, seasonality decomposition approach. These require specialist review before implementation.

---

### Phase 2: Core Data Ingestion (Ad Platforms + Shopify)

**Rationale:** Without data, there is no product. Meta and Google Ads are the highest-priority sources (volume and client priority); Shopify provides the ground-truth outcome variable for ecommerce. This phase produces the first data flowing through the pipeline and validates the ingestion architecture before adding more connectors.

**Delivers:** BullMQ job queue infrastructure, Meta Ads connector, Google Ads connector, Shopify connector, raw landing zone schema, normalization layer with market/geo tagging, data completeness tracking, historical backfill logic (1-3 years), onboarding OAuth flow for these three sources.

**Uses:** BullMQ + Redis (queue), `google-ads-api` npm package, Meta Marketing API REST, `@shopify/shopify-api` SDK, Drizzle for schema migrations

**Implements:** Connector Workers, Credential Vault, Raw Landing Zone, Normalization Layer (ARCHITECTURE.md)

**Avoids:** API rate limits causing stale data (Pitfall 6 — idempotent ingestion with completeness flags), schema changes breaking ingestion silently (Pitfall 7 — schema validation on every response), attribution window mismatch (Pitfall 12 — store attribution window config as metadata with every pull), platform conversion data treated as ground truth (Pitfall 2 — normalization layer enforces Shopify orders as target)

**Research flag:** Needs phase research — Meta and Google Ads API current rate limits and quota tiers, current SDK versions and whether to use official SDKs or raw REST, Shopify webhook vs. polling tradeoffs.

---

### Phase 3: Statistical Engine (MVP)

**Rationale:** With Meta + Google spend data and Shopify revenue data flowing, the statistical engine can run for the first time. This phase implements the core value proposition. The baseline forecasting model must run before incrementality scoring; seasonality decomposition must wrap the baseline model; confidence intervals must gate every output.

**Delivers:** Baseline forecasting model (Prophet-based with STL decomposition), incrementality scorer (DID or synthetic control depending on data sufficiency), saturation curve modeling (spend-response curves), confidence interval computation (scipy), seasonality detection engine, seasonality event registry, post-first-analysis seasonality questionnaire UX, data sufficiency gate (1-year minimum), analysis job queue with async status polling.

**Uses:** FastAPI, statsmodels, Prophet, scipy, CausalPy, pandas, BullMQ analysis-queue

**Implements:** Analytics Engine, Seasonality Registry (ARCHITECTURE.md)

**Avoids:** Correlation-causality confusion (Pitfall 1 — causal model structure enforced), seasonality false positives (Pitfall 4 — STL decomposition before modeling), scale-up without saturation modeling (Pitfall 5 — spend-response curve required), minimum data requirements not enforced (Pitfall 11 — hard gate at 1-year data before analysis runs), attribution window mismatch (Pitfall 12 — analysis window includes attribution tail)

**Research flag:** Needs phase research — CausalPy production readiness verification, specific BSTS vs. synthetic control decision for MVP (data-sufficiency thresholds), Prophet vs. STL decomposition performance comparison on ad data.

---

### Phase 4: Recommendation Engine and MVP Dashboard

**Rationale:** The statistical outputs exist; now they must be surfaced in the two-view format that defines the product. The recommendation engine converts model outputs to actionable budget suggestions. The dual-view dashboard fulfills the dual-audience differentiator. This phase makes the product usable for the first time by end users.

**Delivers:** Recommendation engine (scaled dollar suggestions with confidence bands, suppression below confidence threshold), dual-view dashboard (owner summary view + analyst detail view from identical data), campaign-level incrementality display, confidence threshold UX ("more data needed" state vs. recommendation state), KPI summary cards, date range selector, data freshness indicators, CSV export.

**Addresses:** Dashboard with summary KPIs, confidence intervals on predictions, dual-audience reporting, scaling-first recommendations, campaign-level incrementality scoring (FEATURES.md)

**Avoids:** Dual-audience UX destroying accuracy or losing users (Pitfall 10 — owner view never hides material uncertainty; minimum confidence threshold enforced before any recommendation shown), simplified view diverging from analyst view (Pitfall 10 — both generated from identical underlying data)

**Research flag:** Standard patterns — dashboard/charting is well-documented. May need light UX research on confidence threshold communication language for non-statistician business owners.

---

### Phase 5: Expanded Connectors (CRM + Remaining Ad Platforms)

**Rationale:** The MVP proves the model with ecommerce data. Phase 5 extends to lead gen (CRM integrations) and fills out the ad platform coverage (TikTok, Snapchat, GA4 fallback). CRM integrations require a separate data model branch for lead gen; this is why they come after the ecommerce model is validated.

**Delivers:** HubSpot connector with lead deduplication, Salesforce connector, GoHighLevel connector, Zoho CRM connector, GA4 integration (lead gen fallback with user-selectable conversion events), TikTok Ads connector, Snapchat Ads connector, lead gen incrementality model branch (separate from ecommerce revenue model), CRM lead stage/status qualification step in onboarding, GA4 event picker UI.

**Addresses:** CRM-first lead gen model, GA4 fallback, TikTok + Snapchat integrations, ecommerce + lead gen in one platform (FEATURES.md)

**Avoids:** CRM data quality and deduplication failures (Pitfall 9 — deduplicate on email/phone/name before model input, expose dedup counts to user), single attribution model for all business types (Architecture Anti-Pattern 4 — lead gen model is a separate model branch)

**Research flag:** Needs phase research — HubSpot/Salesforce/GoHighLevel/Zoho API current SDKs and rate limits; TikTok Ads API Python vs. Node SDK decision; Snapchat API stability assessment.

---

### Phase 6: Seasonality and Proactive Recommendations

**Rationale:** After accounts accumulate 12+ months of validated data, brand-specific seasonality patterns become statistically meaningful. This phase matures the seasonality model to brand-specific profiles, adds the proactive budget adjustment suggestions feature, and implements the Google Search Console integration for organic signal awareness.

**Delivers:** Brand-specific seasonality learning (per-account model fitting), proactive budget adjustment suggestions (scheduled seasonality-driven alerts), multi-channel portfolio view (roll-up across campaigns), notification/alert system for budget recommendations, Google Search Console integration, holdout test design assistant (fallback when confidence is insufficient), geo-based test framework (DID for market-level testing).

**Addresses:** Brand-specific seasonality learning, proactive budget adjustment suggestions, holdout test design assistant, multi-market auto-detection, market-aware attribution (FEATURES.md)

**Avoids:** Overfitting to early beta accounts (Pitfall 13 — per-account model configurations, predicted vs. actual outcome tracking), seasonality false positives compounded by limited historical data (Pitfall 4 — recommendations during seasonal windows flagged until 2 full cycles are seen)

**Research flag:** Standard patterns for geo-based DID testing. Proactive scheduling logic is standard; the statistical backing needs analyst review.

---

### Phase 7: Agency Tooling and Multi-Tenant UX

**Rationale:** Agency-specific features (multi-client view, client access controls, white-label options) are high-value for the likely first customer segment but not required for the statistical engine to work. Build after core product is validated.

**Delivers:** Agency admin dashboard (multi-client view), specialist login (view multiple clients), client-only login (view own data), model data flywheel progress indicator, creative data schema (no UI — future-ready), onboarding flow refinements based on user feedback.

**Addresses:** Agency/multi-tenant architecture, model improvement over time data flywheel, creative analysis data architecture (schema only) (FEATURES.md)

**Avoids:** Background job queue data leakage across tenants (Pitfall 14 — explicit tenant_id in all job payloads verified across all job types)

**Research flag:** Standard patterns — multi-tenant SaaS UX is well-documented. No specialist research needed.

---

### Phase Ordering Rationale

- **Foundation before integrations:** Multi-tenant RLS and statistical model architecture must be correct before any data enters the system. These cannot be retrofitted without downtime and security risk.
- **Ecommerce before lead gen:** Shopify provides the cleanest outcome signal. Validating the statistical model on ecommerce first reduces variables. CRM deduplication adds complexity that should be solved separately.
- **Statistical engine before dashboard:** There is nothing meaningful to show until the model runs. A dashboard built on placeholder data creates wrong expectations and builds on the wrong foundation.
- **MVP connectors before expanded connectors:** Meta + Google represent the majority of client ad spend. Proving the model on these before adding TikTok/Snapchat/CRMs reduces integration surface area during the statistically sensitive phase.
- **Proactive recommendations after data maturation:** The seasonality-driven proactive recommendations are only statistically valid after 12+ months of brand-specific data. Building the UI before the model is ready creates a feature that ships broken.

### Research Flags

**Phases needing deeper research before implementation:**
- **Phase 1 (Statistical Engine Design):** Model selection (BSTS vs. DID vs. synthetic control), saturation curve function choice, seasonality decomposition method. Recommend engaging a statistician or incrementality specialist for review before committing.
- **Phase 2 (Data Ingestion):** Current Meta/Google API rate limits and quota tiers (these change; training data may be outdated), SDK vs. raw REST decision for each platform.
- **Phase 3 (Statistical Engine MVP):** CausalPy production readiness, Python model performance benchmarking (inference time within acceptable async job windows), specific confidence threshold values.
- **Phase 5 (CRM + Additional Connectors):** GHL and Zoho API maturity, TikTok Ads API Python vs. Node decision, Snapchat API current stability.

**Phases with standard patterns (research optional):**
- **Phase 4 (Dashboard):** Recharts + shadcn/ui component patterns are well-documented; standard analytics dashboard UX.
- **Phase 7 (Agency Tooling):** Multi-tenant SaaS UX patterns are well-established; no novel technical territory.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core technologies (Next.js, PostgreSQL, Python, TimescaleDB) are HIGH confidence. Better Auth, Drizzle, BullMQ, and Railway are MEDIUM. CausalPy is LOW — newest library with limited production case studies. Verify all package versions against npm/PyPI before scaffolding. |
| Features | MEDIUM | Table stakes are HIGH confidence (industry-established). Differentiators are MEDIUM (competitor feature research limited by training data cutoff). Competitive landscape claims should be validated against live product pages before positioning decisions. |
| Architecture | MEDIUM | Structural patterns (RLS, immutable landing zone, async job queue, connector abstraction) are HIGH confidence. TimescaleDB performance characteristics at scale are MEDIUM. Specific component boundaries may need adjustment as API constraints are discovered. |
| Pitfalls | MEDIUM-HIGH | Multi-tenant isolation and ad platform attribution inflation pitfalls are HIGH confidence (industry-standard, well-documented). Statistical modeling pitfalls are MEDIUM (patterns are sound; specific model choices need domain expert validation). API rate limits are MEDIUM (patterns known; current values need verification). |

**Overall confidence:** MEDIUM

### Gaps to Address

- **CausalPy production readiness:** LOW confidence — verify before committing to this library for Bayesian causal impact. Fallback is Google's BSTS approach implemented in Python with `causalimpact` (port of the R library) or pure PyMC directly.
- **Ad platform API current rate limits and quota tiers:** Research was conducted without live web access. All rate limit values in PITFALLS.md are from training data and may be outdated. Verify Meta, Google, TikTok, and Snapchat limits against current developer docs before designing the ingestion queue topology.
- **Competitor feature validation:** The "no campaign-level incrementality" competitive gap claim is based on training data (August 2025 cutoff). Validate against current competitor product pages before using as a primary positioning claim in marketing.
- **Better Auth organization feature completeness:** Better Auth v1 is recommended over Auth.js for multi-tenant organizations but was relatively new at training cutoff. Verify the organization/role model supports the four required role levels (agency-admin, specialist, client-owner, brand-owner) before committing.
- **Recharts v3 availability:** Recharts v3 was in development at training cutoff. Check whether it has released; if so, evaluate whether v3 has breaking changes to the API before scaffolding chart components.
- **Statistical model confidence thresholds:** The specific numeric thresholds (minimum confidence before showing a recommendation, data sufficiency cutoffs) are product decisions that require user research and statistical expert review. Default values in PITFALLS.md are directional, not validated.

---

## Sources

### Primary (HIGH confidence)
- `PROJECT.md` — project context, requirements, and constraints (full context available throughout all research)
- PostgreSQL official documentation — Row-Level Security patterns and implementation
- Immutable data lake / ELT pattern — industry-standard data engineering (well-documented)
- Async analytics computation pattern — industry-standard for compute-heavy analytics (well-documented)

### Secondary (MEDIUM confidence)
- Training knowledge of comparable analytics platforms: Measured, Rockerbox, Northbeam, Triple Whale, Recast, Prescient AI (knowledge cutoff August 2025)
- Marketing analytics SaaS architecture patterns from Amplitude, Mixpanel engineering blogs
- TimescaleDB documentation and TimescaleDB vs. ClickHouse comparison patterns
- BullMQ documentation and Redis-backed job queue patterns for Node.js
- Meta Marketing API / Google Ads API developer documentation (training data; current values need verification)
- Next.js 15 App Router documentation and Better Auth multi-tenant patterns
- Facebook Robyn MMM documentation — saturation curves and MMM methodology
- Google Causal Impact (BSTS) methodology documentation

### Tertiary (LOW confidence)
- CausalPy / PyMC project documentation (newer library, limited production case studies — verify before committing)
- TikTok and Snapchat Ads API patterns (less documented than Meta/Google at training cutoff)
- Competitor feature claims (competitor sites not directly accessed — validate before use in positioning)

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
