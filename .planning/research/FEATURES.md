# Feature Landscape

**Domain:** Incremental lift measurement / marketing analytics platform
**Project:** Incremental IQ
**Researched:** 2026-02-24
**Confidence note:** Web search and WebFetch were unavailable in this session. All findings draw from training-data knowledge of Measured, Rockerbox, Northbeam, Triple Whale, Lifesight, Recast, and Prescient AI (knowledge cutoff: August 2025). Confidence is MEDIUM for well-established features and LOW for newer/emerging features. Validate against competitor sites before finalizing roadmap.

---

## Table Stakes

Features users expect from any incrementality or marketing analytics platform. Missing = product feels incomplete or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Ad platform integrations** (Meta, Google, TikTok) | Every competitor has these. Without them there is no data to analyze. | Med | OAuth-based API pull. Rate limits and data latency are the hard parts. |
| **Revenue / conversion data ingestion** | Incrementality is meaningless without outcome data to measure lift against. | Med | Shopify webhook/API for ecommerce; CRM for lead gen. |
| **Incrementality score per channel or campaign** | The core output. Users will not trust a platform that cannot score performance. | High | Statistical engine is the hard part; score display is straightforward. |
| **Dashboard with summary KPIs** | Every analytics product has a home dashboard. Absence signals unfinished product. | Low | Spend, revenue, ROAS, incremental revenue, lift %. |
| **Date range selector** | Standard analytics UX expectation. | Low | Last 7/14/30/90 days, custom range, comparison period. |
| **Historical data import** | Users need to analyze past performance before trusting forward recommendations. | Med | Requires backfill logic per API. Meta allows 36 months; Google varies. |
| **Confidence intervals on predictions** | This is an analytics tool claiming statistical rigor — users will ask "how sure are you?" | High | Must accompany every recommendation or score. |
| **Onboarding / data connection flow** | SaaS UX standard. Users cannot discover value if setup is painful. | Med | OAuth flows, account selection, market confirmation, data validation. |
| **Multi-channel view** | Users run spend across 3-5 channels. They need a unified view, not per-channel silos. | Med | Roll-up from campaign → channel → portfolio. |
| **User accounts and authentication** | Basic SaaS requirement. | Low | Email/password + OAuth SSO. RBAC for multi-seat. |
| **Data freshness indicators** | Users need to know when data was last updated to trust it. | Low | "Last synced: X hours ago" per integration. |
| **CSV / Excel export** | Analytics stakeholders always want raw data for their own models. | Low | Export tables, not just charts. |
| **Campaign-level data visibility** | Users coming from ad platforms expect to see their campaign names and spend. | Med | Must map API campaign IDs to user-recognizable names. |
| **Notification / alert system** | "Something changed" alerts are expected in modern analytics. | Med | Budget threshold exceeded, anomaly detected, analysis ready. |
| **Mobile-responsive web UI** | Not a native app requirement, but the dashboard must work on tablet/phone. | Low | CSS responsiveness, not a separate app. |

---

## Differentiators

Features that set Incremental IQ apart from the competitive field. Not universally expected yet, but high-value when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Campaign-level incrementality scoring** (not just channel) | Measured, Rockerbox, and Northbeam operate at channel level. Campaign level is where media specialists actually optimize. This is the primary market differentiator. | High | Requires more granular data aggregation, longer model training windows, and campaign-to-outcome attribution at sub-channel level. |
| **Scaling-first recommendations** ("increase by X% for Y weeks") | Industry default is holdout testing (pause spend, measure drop). This hurts brands. Scale-up tests as the default is a philosophy differentiator, not a feature competitors market. | High | Algorithm must compute expected lift from spend increase, not just measure drop from pause. Requires counterfactual modeling. |
| **Dual-audience reporting** (simple + detailed) | Most tools show analysts the full statistical output and leave business owners confused. Separate simplified and detailed views for the same underlying data is a UX differentiator. | Med | Two report templates fed by the same data model. Toggle or role-based view. |
| **Seasonality detection with user confirmation** | Auto-detected from historical patterns + known retail calendar (BFCM, etc.), then confirmed by the user. Few tools do the "ask the user to validate" step. | High | Time-series decomposition for automated detection; questionnaire UX for confirmation; proactive budget suggestions as output. |
| **Brand-specific seasonality learning** | Generic BFCM seasonality is table stakes. Knowing that *this* swimwear brand peaks in June + late August (not just summer) is differentiated. | High | Requires sufficient historical data (3 years ideal) and per-brand model fitting. |
| **Proactive budget adjustment suggestions** (seasonality-driven) | Most tools report what happened. Suggesting "increase spend 3 weeks before your peak season" is forward-looking and action-oriented. | High | Requires scheduling logic, seasonality forecasts, and push notification/email delivery. |
| **Multi-market auto-detection from campaign geo targets** | Brands running US + AU + UK campaigns often get false signals. Auto-detecting market from geo targets and separating analysis by market is not a standard feature. | Med | Parse geo target metadata from ad APIs; confirm with user during onboarding; segment all analysis by market. |
| **Market-aware attribution** (prevents cross-market false signals) | US spend spike should not appear as AU revenue lift. Explicit market isolation in the model. | High | Data pipeline must tag every spend and outcome event with market before it enters the model. |
| **CRM-first lead gen model** (not GA4-proxy) | GA4 is commonly used as a lead proxy because it is easy. CRM data (actual leads, not clicks to thank-you pages) produces higher-accuracy incrementality scores. | High | Requires HubSpot, Salesforce, GoHighLevel, and Zoho integrations plus lead-to-spend attribution logic. |
| **GA4 as fallback with user-selectable conversion events** | Pragmatic — when CRM is unavailable, let users map their own GA4 events as the lead signal rather than forcing a single conversion event. | Med | GA4 Admin API + event picker UI. |
| **Confidence thresholds with specific resolution suggestions** | Rather than just saying "low confidence," tell the user what test would resolve it: "Run a geo holdout in AU for 3 weeks to reach 95% confidence." | High | Requires a decision-tree recommender tied to the confidence engine. |
| **Holdout test design assistant** (when data is insufficient) | When statistical modeling cannot produce high confidence, guide the user through designing a proper holdout test — market selection, duration, expected signal. | High | Geo-based holdout calculator + experiment design UI. Competitors offer this as their primary feature; Incremental IQ offers it as a fallback. |
| **Agency / multi-tenant architecture** | Agencies managing 10-50 client accounts need hierarchical access. Many tools are brand-direct only. | Med | Org → Client → User permission hierarchy. Specialists see multiple clients; clients see only their own data. |
| **Ecommerce + Lead Gen in one platform** | Most tools are ecommerce-first (Shopify + Klaviyo). Lead gen brands (B2B, services, education) are underserved. | High | Two distinct data models (revenue vs. leads) with unified analysis layer. |
| **Model improvement over time** (data flywheel) | Explicitly communicating that the model gets more accurate as more data accumulates creates lock-in and expectations management. | Med | Progress indicator (e.g., "Your model is at 14 months of data; 36 months recommended for full seasonality detection"). |
| **Creative analysis data architecture** (future-ready) | Storing creative-level metadata in v1 schema so v2 creative analysis is not a rewrite. Not surfaced to users in v1. | Low | Schema design decision, not a user-facing feature in v1. |

---

## Anti-Features

Features to explicitly NOT build in v1, and why.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Traditional media measurement** (TV, radio, print) | Different methodology (MMM), different data sources, entirely separate product surface. Dilutes focus. | Stay in paid digital. Acknowledge the gap. |
| **Organic / SEO measurement** | No causal relationship between paid spend and organic traffic is easy to model. Not in scope. | Integrate GA4 for lead volume only, not organic attribution. |
| **Last-click or MTA attribution** | Multi-touch attribution is a solved (and overcrowded) problem. Triple Whale, Northbeam, and Rockerbox do it. Incremental IQ's differentiator is incrementality, not attribution. | Lead with "incrementality is different from attribution" messaging to avoid positioning confusion. |
| **WooCommerce integration** | Engineering cost with limited incremental market size vs. Shopify in v1. | Add WooCommerce in v2 after validating Shopify integration. |
| **Mobile native app** | Web platform is sufficient for analytics. Mobile app is engineering overhead with low ROI in v1. | Ensure web UI is mobile-responsive. |
| **Custom CRM integrations beyond the 4** | Long tail of CRM integrations (Pipedrive, Monday.com CRM, etc.) is endless. Diminishing returns. | GA4 fallback handles brands without the 4 supported CRMs. |
| **Creative-level analysis UI** | Creative performance is a separate domain requiring creative ingestion, visual rendering, and different analysis models. | Store creative metadata in schema in v1. Ship the UI in v2. |
| **Real-time analytics** | Incrementality models require multi-day or multi-week data windows. Real-time is both technically unnecessary and statistically misleading. | Show "last updated" timestamps. Daily or hourly data syncs are sufficient. |
| **Self-serve media buying / bid management** | This is a different product (DSP / bid management). Attribution companies that tried to bolt this on (e.g., early Rockerbox attempts) diluted their focus. | Produce recommendations; let media specialists act in their ad platforms. |
| **Customer journey mapping / funnel visualization** | This is an attribution product feature (Rockerbox's core), not an incrementality feature. | Out of scope. |
| **Lifetime value (LTV) prediction** | A separate modeling problem requiring customer-level data. Complex enough to be its own product. | Could be v3+; explicitly out of scope for v1 and v2. |

---

## Feature Dependencies

```
Ad platform integrations (Meta, Google, TikTok, Snapchat)
  → Historical data import
    → Statistical forecasting engine
      → Campaign-level incrementality scores
        → Confidence thresholds + resolution suggestions
          → Scaling-first recommendations
          → Holdout test design assistant (when confidence is low)
        → Dashboard with summary KPIs
          → Dual-audience reporting (simple + detailed)
      → Seasonality detection (data-driven)
        → User confirmation questionnaire
          → Brand-specific seasonality model
            → Proactive budget adjustment suggestions

Revenue data ingestion (Shopify)
  → Campaign-level incrementality scores (requires outcome data)

CRM integrations (HubSpot, Salesforce, GoHighLevel, Zoho)
  → Lead gen incrementality scores
  → Market-aware attribution (tag leads by market)

GA4 integration
  → Lead gen fallback (when CRM not connected)

Multi-market detection (from ad API geo targets)
  → User confirmation (onboarding step)
    → Market-aware attribution
      → Market-level segmentation in all reports

User accounts + RBAC
  → Agency / multi-tenant architecture
    → Client login (view own data only)
    → Specialist login (view multiple clients)

Onboarding / data connection flow
  → Historical data import
  → Multi-market detection + confirmation
  → Post-first-analysis seasonality questionnaire
```

---

## MVP Recommendation

The MVP must establish credibility as an incrementality tool, not just a dashboard. Users must trust the statistical output before they will act on recommendations.

**Prioritize for MVP:**

1. **Ad platform integrations** (Meta + Google minimum) — no data, no product
2. **Shopify integration** — ecommerce-first; enables incrementality scoring immediately
3. **Statistical forecasting engine + campaign-level scores** — the core differentiator; everything else is table stakes without this
4. **Confidence thresholds with resolution suggestions** — establishes trust; prevents users from acting on low-confidence scores
5. **Scaling-first recommendations** — the philosophy differentiator; make this the default output, not an add-on
6. **Dual-audience reporting** — business owners need the simple view to share internally; analysts need the detailed view to trust the methodology
7. **Multi-tenant architecture** — agency accounts are likely the first customers; support this from day one or retrofit is painful
8. **Seasonality detection + user questionnaire** — data-driven detection + human confirmation loop; required for accurate scores in seasonal businesses

**Defer to v1.5 / v2:**

- TikTok and Snapchat integrations: Add after Meta + Google are stable; lower data volume brands prioritize Meta/Google
- Proactive budget adjustment suggestions: Requires a full seasonality model cycle; needs 12+ months of validated data first
- CRM integrations: Parallelize with Shopify but lower initial priority (ecommerce first)
- GA4 fallback for lead gen: Needed when CRM not available; lower priority than primary CRM integrations
- Holdout test design assistant: Only needed when confidence is low; implement after the confidence engine exists
- Creative analysis data architecture: Schema decisions needed early, but no rush on implementation; do in data modeling phase

---

## Competitive Landscape Notes

**Measured** (MEDIUM confidence — training data):
- Channel-level incrementality via geo holdout tests
- Primarily holdout-test driven (not statistical forecasting)
- Strong brand: "the incrementality company"
- No campaign-level granularity publicly documented
- Enterprise-tier pricing ($50K+/year)
- Target: mid-to-large DTC brands

**Rockerbox** (MEDIUM confidence — training data):
- Multi-touch attribution as primary product
- Incrementality testing as a secondary feature (holdout tests)
- Strong data connector ecosystem (60+ integrations)
- Channel-level, not campaign-level
- More affordable than Measured, targets mid-tier brands
- Focus on customer journey and attribution, not optimization

**Northbeam** (MEDIUM confidence — training data):
- ML-based attribution, customer journey mapping
- Custom attribution modeling (rules-based and ML)
- Ecommerce focused (Shopify-first)
- No dedicated incrementality methodology; uses synthetic controls
- Competes more with Triple Whale than Measured

**Triple Whale** (MEDIUM confidence — training data):
- Ecommerce analytics dashboard + attribution
- "Pixel" for first-party data
- Creative performance analytics (differentiator vs. Incremental IQ)
- Strong Shopify ecosystem integration
- Not an incrementality tool; primarily attribution + analytics
- Targets high-growth DTC brands

**Lifesight** (LOW confidence — training data, less public information):
- Privacy-first measurement, identity resolution
- Incrementality testing capabilities
- Multi-touch attribution
- Emerging competitor, smaller market presence

**Recast** (MEDIUM confidence — training data):
- Media mix modeling (MMM) as primary methodology
- Statistical approach vs. holdout tests
- Bayesian MMM — produces spend curves and budget allocation
- Channel-level, not campaign-level
- Closest methodological relative to Incremental IQ's statistical approach
- Does not offer campaign-level granularity

**Prescient AI** (LOW confidence — training data):
- MMM for ecommerce brands
- Focused on budget allocation recommendations
- Similar statistical methodology to Recast
- Shopify-focused

**Market gap confirmed:** No competitor publicly advertises campaign-level incrementality scoring as a primary feature. Channel-level is the industry standard. This is Incremental IQ's primary differentiation point.

---

## Sources

- PROJECT.md (project context, requirements, constraints)
- Training data knowledge of Measured, Rockerbox, Northbeam, Triple Whale, Lifesight, Recast, and Prescient AI (knowledge cutoff August 2025)
- WebSearch and WebFetch unavailable in this research session — competitor features should be validated against current product pages before roadmap finalization
- Confidence: MEDIUM for table stakes (well-established across the industry), LOW for competitor-specific claims (unverified without live web access)
