# Incremental IQ

## What This Is

An incremental lift measurement platform that helps mid-tier ecommerce and lead gen brands scale paid media spend with confidence. Unlike existing tools that only measure channel-level impact, Incremental IQ measures at the campaign level — giving media specialists and brand owners precise, actionable recommendations on where to increase (or decrease) investment, backed by statistical modeling and real revenue/lead data.

## Core Value

Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Statistical forecasting engine for campaign-level incrementality (primary methodology)
- [ ] Time-series analysis for pre/post budget change measurement (secondary methodology)
- [ ] Geo-based testing framework for market-level control groups (tertiary methodology)
- [ ] Individual campaign incrementality scores that roll up to clusters, channels, and overall
- [ ] Scaling-first recommendations ("increase budget by X% for Y weeks") as default approach
- [ ] Holdout test suggestions only when other methods lack sufficient data
- [ ] Confidence thresholds — transparent uncertainty with specific test suggestions to resolve gaps
- [ ] Dual-audience reporting: simple summaries for business owners, detailed ranges/confidence intervals for analysts
- [ ] Shopify API integration for ecommerce revenue data (direct + modeled attribution layers)
- [ ] Google Ads API integration
- [ ] Meta Ads API integration
- [ ] TikTok Ads API integration
- [ ] Snapchat Ads API integration
- [ ] Google Search Console API integration
- [ ] CRM integrations for lead gen: HubSpot, Salesforce, GoHighLevel, Zoho CRM (primary lead source)
- [ ] GA4 integration as fallback for lead volume (user-selectable conversion events)
- [ ] Multi-market analysis with auto-detection from campaign geo targets, confirmed by user on source connection
- [ ] Market-aware attribution — prevent cross-market false signals (e.g., US spend spike ≠ AU sales spike)
- [ ] Seasonality detection using known retail events (BFCM, etc.) + data-driven anomaly detection
- [ ] Post-first-analysis seasonality questionnaire — ask user to confirm/identify sales periods and recurring patterns
- [ ] Proactive budget adjustment suggestions based on historical seasonality patterns
- [ ] Multi-tenant access: agency accounts managing multiple client accounts + standalone brand accounts
- [ ] Client login — clients see only their own account data
- [ ] Specialist login — media specialists access multiple client accounts
- [ ] Creative analysis data architecture (schema/models ready, no UI or analysis features in v1)
- [ ] Minimum 1 year historical data requirement, 3 years ideal, model improves over time
- [ ] Prediction outputs: expected outcome ranges with confidence levels (detailed) and simple single-line summaries (simplified)

### Out of Scope

- Creative analysis UI and features — architecture only in v1, full feature deferred to v2
- Traditional media measurement (TV, radio, print) — focused on paid digital
- Organic/SEO measurement — not a focus for this tool
- WooCommerce integration — future expansion beyond Shopify
- Traffic or session-based attribution from GA4 — GA4 used strictly for lead volume
- Mobile app — web platform only for v1

## Context

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
| Statistical modeling as primary methodology | Most scalable, doesn't require pausing spend, works with historical data | — Pending |
| Scaling-first over holdout-first | Rewards growth, doesn't hurt brands during testing, aligns with scaling mission | — Pending |
| CRM-first for lead gen (not GA4) | CRM has actual lead data, GA4 is a proxy; accuracy matters for conviction | — Pending |
| Creative analysis architecture-only in v1 | Reduce scope, focus on core campaign analysis, future-proof the data model | — Pending |
| Dual attribution layers (direct + modeled) | Transparency — show what's trackable alongside what's estimated | — Pending |
| 4 CRMs in v1 (HubSpot, Salesforce, GHL, Zoho) | Cover the mid-tier brand market broadly from day one | — Pending |

---
*Last updated: 2026-02-24 after initialization*
