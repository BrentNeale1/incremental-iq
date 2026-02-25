# Requirements: Incremental IQ

**Defined:** 2026-02-24
**Core Value:** Campaign-level incremental lift analysis that tells brands exactly which campaigns to scale, by how much, and for how long — with transparent confidence levels so no recommendation is made without measurable expected impact.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Integrations

- [x] **INTG-01**: User can connect Meta Ads account via OAuth and pull campaign/ad set/ad data
- [x] **INTG-02**: User can connect Google Ads account via OAuth and pull campaign data
- [x] **INTG-03**: User can connect Shopify store and pull order/revenue data
- [x] **INTG-04**: User can connect GA4 and select which conversion events represent leads
- [x] **INTG-05**: System backfills historical data from all connected sources (1yr min, 3yr ideal)

### Statistical Engine

- [x] **STAT-01**: System builds baseline forecast model from historical data for each campaign
- [x] **STAT-02**: System produces campaign-level incrementality scores that roll up to clusters, channels, and overall
- [x] **STAT-03**: All predictions and scores include confidence intervals
- [x] **STAT-04**: System performs time-series pre/post analysis when budget changes are detected
- [x] **STAT-05**: System supports geo-based testing with market-level control groups
- [x] **STAT-06**: System models saturation curves to detect diminishing returns on spend
- [x] **STAT-07**: Model accuracy improves as more data accumulates over time

### Recommendations

- [x] **RECC-01**: System defaults to scaling-first recommendations ("increase budget by X% for Y weeks")
- [x] **RECC-02**: Each recommendation includes expected outcome (simple estimate for owners, ranges with confidence for analysts)
- [x] **RECC-03**: System states uncertainty transparently and suggests specific tests to resolve data gaps
- [x] **RECC-04**: System can design holdout tests when statistical modeling lacks sufficient confidence
- [ ] **RECC-05**: System proactively suggests budget adjustments ahead of known seasonal periods
- [x] **RECC-06**: Holdout tests are suggested only as a last resort, never as the first option

### Seasonality

- [x] **SEAS-01**: System includes pre-loaded retail event calendar (BFCM, Christmas, etc.)
- [x] **SEAS-02**: System detects anomalies and seasonal patterns from historical data

### Multi-Market

- [x] **MRKT-01**: System auto-detects markets from campaign geo targeting metadata
- [ ] **MRKT-02**: User confirms or corrects detected markets during onboarding
- [ ] **MRKT-03**: Attribution model isolates markets to prevent cross-market false signals
- [ ] **MRKT-04**: All reports and analysis can be segmented by market

### Reporting & UI

- [ ] **RPRT-01**: Dashboard displays summary KPIs (spend, revenue, ROAS, incremental revenue, lift %)
- [x] **RPRT-02**: User can select date ranges (7/14/30/90 days, custom range, comparison period)
- [x] **RPRT-03**: Multi-level view: campaign → cluster → channel → overall rollups
- [x] **RPRT-04**: Data freshness indicator per connected integration
- [ ] **RPRT-05**: User can export data as CSV/Excel
- [ ] **RPRT-06**: Web UI is mobile-responsive
- [x] **RPRT-07**: Dual-audience views: simple summaries for business owners, detailed statistical output for analysts

### Access

- [x] **AUTH-01**: User can sign up with email and password
- [x] **AUTH-02**: User can log in with session persistence across browser refresh
- [x] **AUTH-03**: User can log out from any page

### Data Architecture

- [x] **ARCH-01**: Data schema supports creative-level metadata for future v2 analysis
- [x] **ARCH-02**: Dual attribution layers: direct (trackable) and modeled (estimated) shown side by side
- [x] **ARCH-03**: System enforces minimum 1 year historical data before first analysis, recommends 3 years

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Data Integrations

- **INTG-06**: TikTok Ads API integration
- **INTG-07**: Snapchat Ads API integration
- **INTG-08**: Google Search Console API integration
- **INTG-09**: HubSpot CRM integration (lead data as primary source)
- **INTG-10**: Salesforce CRM integration
- **INTG-11**: GoHighLevel CRM integration
- **INTG-12**: Zoho CRM integration
- **INTG-13**: WooCommerce integration (ecommerce revenue source)

### Seasonality

- **SEAS-03**: Post-first-analysis questionnaire asking user to confirm/identify sales periods
- **SEAS-04**: Brand-specific seasonal pattern learning (per-brand model fitting over time)

### Access & Multi-Tenancy

- **AUTH-04**: Agency accounts managing multiple client accounts
- **AUTH-05**: Client-only login (view own account data only)
- **AUTH-06**: Specialist login (access multiple client accounts)
- **AUTH-07**: Role-based access control (admin, analyst, viewer)

### Reporting

- **RPRT-08**: Notification/alert system (anomaly detected, analysis ready, budget threshold exceeded)
- **RPRT-09**: Model accuracy progress indicator ("14 months of data, 36 recommended")

### Creative Analysis

- **CRTV-01**: Creative performance analysis UI (which creatives drive best incremental results)
- **CRTV-02**: Creative-level reporting and recommendations

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Traditional media measurement (TV, radio, print) | Different methodology (MMM), different data sources, entirely separate product |
| Organic/SEO measurement | No clear causal relationship between paid spend and organic traffic |
| Last-click / multi-touch attribution | Overcrowded market (Triple Whale, Northbeam, Rockerbox). Incremental IQ's differentiator is incrementality, not attribution |
| Mobile native app | Web platform sufficient for analytics; ensure responsive design instead |
| Real-time analytics | Incrementality models require multi-day/week data windows; real-time is statistically misleading |
| Self-serve media buying / bid management | Different product category entirely; produce recommendations, let specialists act in ad platforms |
| Customer journey mapping / funnel visualization | Attribution product feature, not incrementality |
| LTV prediction | Separate modeling problem requiring customer-level data; complex enough for its own product |
| Custom CRM integrations beyond the 4 planned | Long tail with diminishing returns; GA4 fallback covers other CRMs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Complete |
| ARCH-02 | Phase 1 | Complete |
| ARCH-03 | Phase 1 | Complete |
| INTG-01 | Phase 2 | Complete |
| INTG-02 | Phase 2 | Complete |
| INTG-03 | Phase 2 | Complete |
| INTG-05 | Phase 2 | Complete |
| STAT-01 | Phase 3 | Complete |
| STAT-02 | Phase 3 | Complete |
| STAT-03 | Phase 3 | Complete |
| STAT-04 | Phase 3 | Complete |
| STAT-05 | Phase 3 | Complete |
| STAT-06 | Phase 3 | Complete |
| STAT-07 | Phase 3 | Complete |
| SEAS-01 | Phase 3 | Complete |
| SEAS-02 | Phase 3 | Complete |
| RECC-01 | Phase 4 | Complete |
| RECC-02 | Phase 4 | Complete |
| RECC-03 | Phase 4 | Complete |
| RECC-04 | Phase 4 | Complete |
| RECC-05 | Phase 4 | Pending |
| RECC-06 | Phase 4 | Complete |
| RPRT-01 | Phase 4 | Pending |
| RPRT-02 | Phase 4 | Complete |
| RPRT-03 | Phase 4 | Complete |
| RPRT-04 | Phase 4 | Complete |
| RPRT-05 | Phase 4 | Pending |
| RPRT-06 | Phase 4 | Pending |
| RPRT-07 | Phase 4 | Complete |
| INTG-04 | Phase 5 | Complete |
| MRKT-01 | Phase 5 | Complete |
| MRKT-02 | Phase 5 | Pending |
| MRKT-03 | Phase 5 | Pending |
| MRKT-04 | Phase 5 | Pending |
| AUTH-01 | Phase 6 | Complete |
| AUTH-02 | Phase 6 | Complete |
| AUTH-03 | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-24*
*Last updated: 2026-02-25 — RPRT-03 and RPRT-04 complete (04-05-PLAN.md: DrillDownTable with campaign/cluster/channel/overall hierarchy + SyncStatusList with freshness indicators and stale data warnings)*
