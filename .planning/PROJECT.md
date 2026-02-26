# Incremental IQ

## What This Is

An incremental lift measurement platform that helps mid-tier ecommerce and lead gen brands scale paid media spend with confidence. Unlike existing tools that only measure channel-level impact, Incremental IQ measures at the campaign level — giving media specialists and brand owners precise, actionable recommendations on where to increase (or decrease) investment, backed by statistical modeling and real revenue/lead data.

## Core Value

Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.

## Requirements

### Validated

- ✓ Multi-tenant schema with RLS, dual attribution, creative metadata — v1.0
- ✓ Meta Ads, Google Ads, Shopify integrations via OAuth — v1.0
- ✓ GA4 integration for lead gen (user-selectable conversion events) — v1.0
- ✓ Historical backfill (1yr min, 3yr ideal) with analysis gate — v1.0
- ✓ Prophet baseline forecasting per campaign — v1.0
- ✓ CausalPy incrementality scoring with confidence intervals — v1.0
- ✓ Hill saturation curve modeling — v1.0
- ✓ Budget change detection with pre/post analysis — v1.0
- ✓ Seasonality detection with retail calendar + anomaly detection — v1.0
- ✓ Campaign-level scores rolling up to cluster/channel/overall — v1.0
- ✓ Scaling-first recommendations (holdout as last resort) — v1.0
- ✓ Dual-audience views (executive summary + analyst detail) — v1.0
- ✓ Dashboard with KPIs, date range, drill-down, CSV/Excel export — v1.0
- ✓ Multi-market attribution with auto-detection and onboarding confirmation — v1.0
- ✓ Email/password auth with session persistence and logout — v1.0
- ✓ Onboarding wizard (connect integrations, GA4 events, markets, outcome mode) — v1.0

### Active

- [ ] TikTok Ads API integration
- [ ] Snapchat Ads API integration
- [ ] Google Search Console API integration
- [ ] CRM integrations for lead gen: HubSpot, Salesforce, GoHighLevel, Zoho CRM
- [ ] Multi-tenant access: agency accounts managing multiple client accounts
- [ ] Client login — clients see only their own account data
- [ ] Specialist login — media specialists access multiple client accounts
- [ ] Post-first-analysis seasonality questionnaire — ask user to confirm/identify sales periods
- [ ] Creative analysis UI and recommendations (schema ready from v1.0)

### Out of Scope

- Creative analysis UI and features — architecture only in v1, full feature deferred to v2
- Traditional media measurement (TV, radio, print) — focused on paid digital
- Organic/SEO measurement — not a focus for this tool
- WooCommerce integration — future expansion beyond Shopify
- Traffic or session-based attribution from GA4 — GA4 used strictly for lead volume
- Mobile app — web platform only for v1

## Context

**Current state:** v1.0 shipped 2026-02-26. 43,280 LOC across TypeScript (Next.js + packages), Python (FastAPI sidecar), CSS, SQL. 37/37 requirements satisfied. 12 tech debt items tracked for v1.1.

**Tech stack:** Next.js 15 (App Router), Drizzle ORM, PostgreSQL + TimescaleDB, Better Auth, BullMQ + Redis, Python FastAPI (Prophet, CausalPy, PyMC), TanStack Query, Zustand, Tailwind v4 + shadcn/ui, Recharts.

**Market gap**: Most incremental measurement tools (e.g., Measured, Rockerbox) operate at the channel level — "Meta drove X% incremental revenue." Incremental IQ goes deeper to the campaign level, which is where media specialists actually make optimization decisions.

**Scaling-first philosophy**: The industry default is holdout testing (pause spend, measure drop). This hurts brands during the test period. Incremental IQ defaults to scale-up tests (increase spend, measure lift) — rewarding growth rather than penalizing it. Holdouts are a last resort when data is insufficient for statistical modeling.

**Dual audience challenge**: Business owners need "increase Campaign X by $5K/month, expect 25-35% more revenue." Data analysts need the confidence intervals, p-values, and methodology details behind that recommendation. Both views must be accurate and conviction-driven.

**Seasonality complexity**: Seasonality isn't universal — a swimwear brand peaks in summer while a ski brand peaks in winter. The tool must learn each brand's specific seasonal patterns from historical data, confirm with the user, and proactively suggest budget adjustments ahead of known seasonal periods.

**Multi-market attribution**: Brands running campaigns across US, UK, AU, etc. need market-level separation to prevent false signals. Campaign geo targets are auto-detected and confirmed by the user during onboarding.

**Lead gen model**: For non-ecommerce clients, CRM data (HubSpot, Salesforce, GoHighLevel, Zoho) is the primary lead source. GA4 is a fallback only when CRM is not available, with users selecting which GA4 events represent leads.

## Constraints

- **Data minimum**: 1 year of historical ad platform data required before first analysis; 3 years ideal for robust seasonality detection
- **Ecommerce first**: Shopify is the v1 commerce platform; WooCommerce and others come later
- **Paid media focus**: Relationship between paid channels only — no traditional media, no organic
- **API dependencies**: Dependent on ad platform API stability and rate limits (Meta, Google, TikTok, Snapchat)
- **CRM scope**: HubSpot, Salesforce, GoHighLevel, Zoho for v1 — no custom CRM integrations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Statistical modeling as primary methodology | Most scalable, doesn't require pausing spend, works with historical data | ✓ Good — Prophet + CausalPy ITS working |
| Scaling-first over holdout-first | Rewards growth, doesn't hurt brands during testing, aligns with scaling mission | ✓ Good — holdout only on low-confidence path |
| CRM-first for lead gen (not GA4) | CRM has actual lead data, GA4 is a proxy; accuracy matters for conviction | ⚠️ Revisit — CRMs deferred to v1.1, GA4 serves as lead source in v1.0 |
| Creative analysis architecture-only in v1 | Reduce scope, focus on core campaign analysis, future-proof the data model | ✓ Good — schema ready, no wasted effort |
| Dual attribution layers (direct + modeled) | Transparency — show what's trackable alongside what's estimated | ✓ Good — both columns populated end-to-end |
| 4 CRMs deferred to v1.1 | Scope reduction — GA4 covers lead gen adequately for launch | ✓ Good — shipped faster without CRM complexity |
| Better Auth for authentication | Lightweight, Drizzle adapter, session-based (no JWT complexity) | ✓ Good — clean integration with existing DB |
| Python FastAPI sidecar for stats | Prophet/CausalPy/PyMC ecosystem requires Python; TypeScript orchestration layer bridges the gap | ✓ Good — clean separation of concerns |

---
*Last updated: 2026-02-26 after v1.0 milestone*
