# Domain Pitfalls

**Domain:** Incremental lift measurement / marketing analytics platform (Incremental IQ)
**Researched:** 2026-02-24
**Confidence note:** Web search tools unavailable during this session. All findings draw from training knowledge (cutoff: August 2025) on marketing analytics, incrementality measurement, ad platform APIs, and multi-tenant SaaS. Confidence levels reflect knowledge depth per domain — this is a well-documented problem space with clear industry failure patterns. Flag for validation before finalizing phase decisions that depend on statistical modeling specifics.

---

## Critical Pitfalls

Mistakes that cause rewrites, bad recommendations to clients, or loss of trust.

---

### Pitfall 1: Confusing Correlation With Incrementality in Statistical Models

**What goes wrong:** The model identifies that a campaign correlates with revenue growth and recommends scaling it, when the campaign was simply present during an organic growth period. The recommendation causes spend increase with no incremental return — the brand loses money on trust.

**Why it happens:** Regression-based incrementality models without proper causal structure (e.g., naive OLS on spend vs. revenue) pick up confounders: seasonality, brand growth trends, competitor pullback, PR events. The model finds a signal that is real but not causal.

**Consequences:** Recommendations that consistently fail erode trust faster than no recommendations. Brands scale spend, see no lift, churn. This is an existential risk for the product — the core value prop is "trust the recommendation."

**Prevention:**
- Use causal inference frameworks from the start: Bayesian Structural Time Series (BSTS), Facebook Robyn-style MMM with saturation curves, or difference-in-differences with proper control selection
- Never allow a single-variable regression to produce a scaling recommendation
- Every recommendation must pass a counterfactual test: "What would revenue have been without this campaign spend?" must be answerable
- Validate model outputs against known holdout experiments (even historical ones) before shipping

**Detection (warning signs):**
- Model recommends scaling in a brand's weakest performing period
- Incrementality scores cluster suspiciously near 1.0 (perfect attribution) — real data is messier
- Model agrees with the platform's self-reported ROAS too closely (platforms optimize for self-reported ROAS, not incrementality)
- All campaigns for a brand score similar incremental lift regardless of structural differences

**Phase to address:** Phase 1 (statistical engine design) — this is architectural, cannot be retrofitted

**Confidence:** MEDIUM (well-documented failure in MMM/incrementality literature; specific model choice needs validation)

---

### Pitfall 2: Treating Ad Platform Data as Ground Truth

**What goes wrong:** The platform ingests Meta/Google/TikTok spend and conversion data, uses platform-reported conversions as the revenue/lead signal for the incrementality model, and produces recommendations based on what the platforms claim they drove — which is systematically inflated and overlapping across platforms.

**Why it happens:** Ad platforms use last-click, view-through, or multi-touch attribution internally. Every platform takes credit for the same conversion. If you sum Meta + Google + TikTok attributed revenue, you will exceed actual revenue by 2-5x in most multi-channel accounts.

**Consequences:** Every model built on platform-reported conversions is garbage-in, garbage-out. The incrementality score is actually measuring "how much does platform-reported attribution agree with platform-reported spend" — a circular dependency. Recommendations generated this way have no validity.

**Prevention:**
- The source of truth for conversions must ALWAYS be Shopify (ecommerce) or CRM (lead gen) — never the ad platform's attributed conversion count
- Build a clear "revenue reconciliation" step that maps platform spend to actual Shopify revenue, explicitly ignoring platform conversion counts
- Flag explicitly in the data pipeline: `platform_reported_conversions` is a feature/input, never the target variable
- The model target variable should be Shopify orders/revenue or CRM leads/pipeline — period

**Detection (warning signs):**
- Total attributed revenue from ad platforms exceeds Shopify revenue — guaranteed data integrity failure
- Model "performance" improves significantly when platform conversion windows are extended — sign you're measuring attribution, not incrementality
- Campaigns on platforms with longer attribution windows consistently score higher incrementality

**Phase to address:** Phase 1 (data model) and Phase 2 (Shopify/CRM integrations) — the data model must establish ground truth sources before any analysis is built

**Confidence:** HIGH (industry-standard knowledge; the "attribution inflation" problem is one of the most documented issues in digital marketing analytics)

---

### Pitfall 3: Cross-Market Signal Contamination

**What goes wrong:** A brand increases US campaign spend during a promotional period. Australian revenue also spikes during the same period (due to an unrelated cause — email campaign, influencer post, seasonal event). The model attributes the Australian revenue lift to the US campaign spend increase, producing inflated incrementality scores for campaigns that had zero reach in Australia.

**Why it happens:** Without explicit market-level segmentation in the model, all revenue and all spend get pooled. Time-series correlations fire across geographic boundaries because the model doesn't know that US campaigns cannot influence AU customers.

**Consequences:** The platform recommends scaling US campaigns claiming AU lift, the brand scales, AU lift disappears, trust is destroyed. Worse: the brand may never understand why — "the math said it would work."

**Prevention:**
- Market segmentation is not optional — it is a first-class data dimension that must be established at data ingestion
- Campaign geo targets must be parsed at ingestion and stored as campaign metadata (not UI-only)
- Model must enforce a constraint: a campaign's incrementality can only be measured against the revenue markets that campaign targeted
- The geo-target confirmation step during onboarding is not a UX nicety — it is a model integrity requirement; treat it as a validation gate before first analysis runs
- Build a cross-market leakage detection check: flag when revenue in a market correlates with spend in a market the campaign did not target

**Detection (warning signs):**
- A campaign targeting only US shows lift in AU or EU market revenue
- Markets with no active campaigns show revenue correlating with spend periods
- Model incrementality score for a campaign exceeds the portion of brand revenue reachable by that campaign's geo target

**Phase to address:** Phase 2 (data model, geo-targeting ingestion) — must be designed before the analysis engine, not added afterward

**Confidence:** MEDIUM (derived from standard causal inference principles and geo-based testing practice; specific implementation details need domain expert validation)

---

### Pitfall 4: Seasonality False Positives and False Negatives

**What goes wrong (false positive):** The seasonality detection algorithm flags a spend increase during peak season as "incremental lift" when the revenue increase was entirely seasonal. Every brand that spends more at BFCM sees revenue increase — that's seasonality, not incrementality. The model tells the brand to increase BFCM spend next year at the same rate, they get diminishing returns, and blame the tool.

**What goes wrong (false negative):** A brand with a strong seasonal pattern (e.g., swimwear, ski gear, back-to-school products) that doesn't overlap with standard retail events gets missed entirely. The model has no prior for this pattern, attributes the seasonal revenue spike to whatever campaign was running at the time, and recommends scaling that campaign year-round.

**Why it happens:** Standard seasonality adjustment uses fixed indicators (day-of-week, month, BFCM, Christmas, etc.). Brand-specific seasonality is invisible to generic models. Without brand-specific seasonality priors, the model confounds seasonal lift with campaign lift constantly.

**Consequences:** Scaling recommendations that work only seasonally get applied year-round. Budget waste. Trust erosion.

**Prevention:**
- Decompose time-series into trend + seasonality + residual (STL decomposition or Prophet) before building the incrementality model — the model should operate on the residual, not raw revenue
- Build brand-specific seasonality profiles from historical data as a prerequisite to first analysis (this is what the post-onboarding seasonality questionnaire is for)
- Flag all recommendations made during known seasonal windows with a "seasonality confound" warning until the model has seen at least 2 full years of data for that brand
- Never allow a recommendation to be based on fewer than 2 comparable seasonal periods — one year of BFCM data is not enough to separate seasonal from campaign-driven lift

**Detection (warning signs):**
- All campaigns for a brand score high incrementality during the same calendar period
- Incrementality scores spike during BFCM/Christmas regardless of campaign structure changes
- Model residuals show strong autocorrelation (seasonality was not properly removed)
- Brand has less than 1 year of data and already has high-confidence incrementality scores — confidence is lying

**Phase to address:** Phase 1 (statistical engine) — seasonality decomposition must be foundational, not a post-processing add-on

**Confidence:** MEDIUM (standard time-series modeling knowledge; specific decomposition method choice needs statistical validation)

---

### Pitfall 5: Recommending Scale-Up Without Saturation Modeling

**What goes wrong:** A campaign shows incremental lift at current spend levels. The platform recommends increasing budget by 40%. The brand increases budget by 40%. ROAS drops 30% because the campaign was already near saturation — the incremental return from additional spend is sharply diminishing. The scaling recommendation was technically correct at current spend levels but did not model what happens when spend changes.

**Why it happens:** Many incrementality models measure "is this campaign incremental?" (binary) or "what is current incrementality?" (point-in-time). They do not model the spend-response curve — the relationship between spend level and incremental return at different investment levels. Recommending a specific dollar increase requires knowing the marginal return at the new spend level, not just the average return at the current level.

**Consequences:** Recommendations that consistently over-promise ROI from scaling erode trust at exactly the moment the brand acts on the recommendation. The negative signal is clear and attributable to the platform.

**Prevention:**
- Use saturation curves (e.g., Hill functions, Michaelis-Menten, or log-saturation transformations) on spend as part of the model
- "Increase budget by X%" recommendations must be generated from the slope of the spend-response curve at the current spend level — not from the current point-estimate of lift
- Include an upper bound estimate in all scaling recommendations: "beyond $X/month, additional spend shows minimal incremental return"
- Test recommendations in stages: recommend 15-20% increases with 4-week measurement windows rather than large jumps

**Detection (warning signs):**
- Recommendations consistently suggest the same percentage increase regardless of current spend level
- High-spend campaigns score similarly to low-spend campaigns on incrementality
- Model has no concept of "saturation" or "diminishing returns" in its output schema

**Phase to address:** Phase 1 (statistical engine) — saturation is core to the model architecture, not a feature add

**Confidence:** MEDIUM (standard MMM practice; saturation curve specifics need domain expert review)

---

## Moderate Pitfalls

---

### Pitfall 6: Ad Platform API Rate Limits Causing Stale Data

**What goes wrong:** The ingestion pipeline pulls historical data from Meta, Google, TikTok, and Snapchat APIs. Rate limits cause some calls to fail silently or be throttled. The database shows data through yesterday but is actually missing the last 3 days for one account. Incrementality scores are calculated on incomplete data, and no warning is surfaced to the user.

**Why it happens:** Each ad platform has independent, asymmetric rate limits. Meta's Marketing API throttles at the account level and has tier-based quotas. Google Ads API uses per-developer-token quotas with daily limits. TikTok's API has documented lower rate limits than Meta/Google. Snapchat's API is less mature and more prone to silent failures.

**Specific known constraints (MEDIUM confidence — verify against current docs):**
- Meta Marketing API: uses "BUC" (Business Use Case) throttling; rate limits depend on ad account tier, not flat per-request
- Google Ads API: 15,000 operations per day per developer token (basic tier), 160,000 per day (standard tier)
- TikTok Ads API: significantly lower limits; bulk historical pulls are rate-constrained
- Snapchat Ads API: historically least stable; frequent breaking changes in schema

**Consequences:** Silent data gaps cause models to run on incomplete windows, producing confidence intervals that are misleadingly narrow. Users trust numbers that are based on holes in the data.

**Prevention:**
- Every data ingestion job must record `ingested_at`, `period_start`, `period_end`, AND a `data_completeness_flag` for each account/platform/day combination
- Build a data freshness dashboard visible to the platform operator (not just the client) showing last successful sync per platform per account
- Any analysis should refuse to run (or show a prominent warning) if data completeness for the analysis window is below a threshold (e.g., 95%)
- Implement exponential backoff with jitter for all API calls; never retry immediately on 429
- Queue historical pulls as background jobs; never run them synchronously in the request cycle
- Design the ingestion schema to be append-only with idempotency keys — partial re-ingestion should be safe

**Detection (warning signs):**
- Analysis windows show "complete" data for rounded date ranges (suggests gaps were silently filled)
- Platform-reported totals don't match sum of daily records
- Incrementality scores change significantly when re-running analysis without any new data being added

**Phase to address:** Phase 2 (API integrations) — data completeness must be a first-class concern from the first integration, not bolted on later

**Confidence:** MEDIUM (rate limiting patterns are well-documented; specific current limits require verification against 2025-2026 API docs)

---

### Pitfall 7: Ad Platform Schema Changes Breaking Ingestion Silently

**What goes wrong:** Meta deprecates a field, renames a metric, or changes how attribution windows work in their API response schema. The ingestion pipeline continues to run without errors but is now storing null values or computing metrics using the old field mapping. Downstream models receive corrupted data silently for weeks before someone notices.

**Why it happens:** Ad platforms change their APIs frequently. Meta's Marketing API has had multiple breaking changes including attribution window changes (affecting how conversions are counted), field deprecations, and API version sunsets. Google's API versioning has forced migration cycles. TikTok's API has changed field names without advance notice.

**Consequences:** Weeks of corrupted data in the model. Trust destruction when a client notices their numbers look wrong. Silent corruption is worse than loud failure because the platform looks like it's working fine.

**Prevention:**
- Pin all API calls to an explicit API version; subscribe to platform developer changelogs
- Run schema validation on every API response — fail loudly when an expected field is missing or type-changed, rather than defaulting to null
- Build a "schema snapshot" test that runs weekly: pull a small sample and compare field structures to the expected schema
- Never store raw API responses as the canonical data layer — always transform through a validated, schema-enforced mapping layer
- Set up monitoring alerts for sudden drops in any field's null rate (e.g., if `conversions` goes from 0.1% null to 40% null, something broke)

**Detection (warning signs):**
- Metrics for an account show a sudden step-change on a specific date with no corresponding ad activity change
- Platform-reported totals drift from stored totals over time
- A field that previously always had values suddenly has high null rates

**Phase to address:** Phase 2 (API integrations) — schema validation must be built into the first integration, not added in maintenance mode

**Confidence:** MEDIUM (API versioning and schema change patterns are well-documented across Meta, Google; specific TikTok/Snapchat patterns need current verification)

---

### Pitfall 8: Multi-Tenant Data Isolation Failures

**What goes wrong:** An agency has 20 client accounts. A bug in tenant-scoping logic — a missing WHERE clause, a misconfigured RLS policy, an incorrectly shared cache key — means Client A can see Client B's spend data, incremental scores, or revenue figures. In an agency setting, clients are often competitors in the same vertical.

**Why it happens:** Multi-tenant isolation failures are extremely common in analytics SaaS. The failure modes include: ORM queries that forget to scope by `tenant_id`, caching layers that use query-based keys without tenant context, analytics aggregations that cross tenant boundaries, and async jobs that lose tenant context when moving between queue workers.

**Consequences:** Legal liability (contract breach, possible regulatory implications). Loss of agency and client trust. Potentially catastrophic: a DTC brand seeing a competitor's campaign strategy.

**Prevention:**
- Use Row-Level Security (RLS) in PostgreSQL as the enforcement layer — not application-level filtering alone. RLS is enforced at the database level and cannot be bypassed by query bugs
- Every database table that contains client data must have a `tenant_id` (or `organization_id`) column; no exceptions
- Test multi-tenant isolation explicitly with automated tests that:
  1. Create two isolated tenant accounts
  2. Insert data for both
  3. Query as Tenant A and assert Tenant B's data is never returned
- Cache keys must always include tenant context (`{tenant_id}:{query_hash}`, never `{query_hash}` alone)
- Async/background jobs must carry tenant context through the job payload and restore it before any database operations
- Conduct a tenant isolation security review before any client data enters production

**Detection (warning signs):**
- Any endpoint that returns aggregate data without requiring a tenant filter parameter
- Cache hit rates that seem too high across tenants with similar query patterns
- Background job failures that show data from multiple tenants in error logs

**Phase to address:** Phase 1 (data model) and Phase 3 (multi-tenant auth) — RLS policies must be established before any client data enters the database, cannot be retrofitted safely

**Confidence:** HIGH (row-level security and multi-tenant isolation are standard SaaS security knowledge; PostgreSQL RLS is well-documented)

---

### Pitfall 9: CRM Data Quality and Deduplication Failures

**What goes wrong:** HubSpot contains 3 records for "John Smith" from the same company. The CRM-to-platform sync imports all 3 as separate leads. The incrementality model thinks the campaign drove 3 leads when it drove 1. The model produces a 3x inflated incrementality score for lead campaigns.

**Why it happens:** CRMs are notoriously dirty in the mid-market. HubSpot's deduplication is opt-in and imperfect. Salesforce has custom dedup logic that varies by implementation. GoHighLevel is newer with less mature dedup tooling. When multiple CRMs are supported, the dedup logic needs to work across all of them.

**Consequences:** Lead-gen brands see inflated incrementality scores for any campaign tied to a noisy CRM data period. Recommendations to scale are based on phantom leads. The brand scales, lead quality/volume doesn't improve, trust is broken.

**Prevention:**
- Never use raw CRM contact/lead count as the model input — use deduplicated, qualified lead records
- Build a deduplication step in the CRM ingestion pipeline: match on email (normalized to lowercase), phone (normalized), and company name (fuzzy)
- Make the dedup logic transparent to the user: show them "We ingested 450 raw leads, deduplicated to 387 unique leads" during onboarding
- Require users to specify which CRM stage/status represents a "qualified lead" during connection setup — don't assume all records are leads
- Flag accounts where CRM duplicate rates are high (>20%) and warn that incrementality scores may be overstated until data is cleaned

**Detection (warning signs):**
- CRM lead counts far exceed expected conversion rates for the traffic volume
- Multiple records with identical email addresses or phone numbers in the same date window
- CRM lead volume shows sudden spikes on import dates (bulk imports contaminating the model)

**Phase to address:** Phase 2 (CRM integrations) — deduplication logic must be part of the ingestion spec, not a post-launch cleanup task

**Confidence:** MEDIUM (CRM data quality issues are a known industry problem; specific dedup implementation details depend on which CRM APIs expose what data)

---

### Pitfall 10: Dual-Audience UX Destroying Accuracy or Losing Users

**What goes wrong (oversimplification):** The simplified view for business owners says "increase Campaign X by $5,000/month." The underlying model has a confidence interval of 30-200% expected lift — the uncertainty is so high the recommendation has no real meaning. But the simplified view hides this, and the business owner acts on the recommendation with false confidence.

**What goes wrong (over-complexity):** The detailed analyst view surfaces all confidence intervals, p-values, and model parameters. The media specialist (who is not a statistician) gets confused, loses trust in the numbers they don't understand, and stops using the platform.

**Why it happens:** Building for two audiences is genuinely hard. Most tools pick one audience. When forced to serve both, teams default to: show everything to analysts (overwhelming) and hide uncertainty from business owners (misleading).

**Consequences:** Either the business owner makes bad decisions based on false confidence, or the analyst disengages because the interface doesn't match their workflow. Both cause churn.

**Prevention:**
- The simplified view must never hide uncertainty that materially affects the decision. If confidence is LOW, the simplified view must say "We need more data before recommending this confidently" — not manufacture a confident-sounding number
- Define a minimum confidence threshold below which no scaling recommendation is shown (even simplified) — instead show a data collection suggestion
- The detailed view should explain each metric in context: not just "p = 0.04" but "p = 0.04 (there's a 4% chance this result occurred by chance — conventionally, below 5% is considered reliable)"
- Test both views with real users from both audiences before launch — not internal stakeholders
- The two views must be generated from identical underlying data — never calculate simplified metrics separately from detailed metrics (divergence is a trust killer)

**Detection (warning signs):**
- The simplified view shows a recommendation when the detailed view shows a wide confidence interval spanning negative returns
- Users from one audience stop logging in within 2-3 sessions (engagement drop by audience segment)
- Business owners report making decisions that conflict with what analysts see in the same platform

**Phase to address:** Phase 4 (reporting/UX) — but the confidence thresholds and recommendation suppression logic must be in the model engine (Phase 1) so the UX can pull from them

**Confidence:** MEDIUM (UX pattern knowledge; the specific threshold values need user research validation)

---

## Minor Pitfalls

---

### Pitfall 11: Minimum Data Requirements Not Enforced at Onboarding

**What goes wrong:** A brand with 4 months of ad data connects and receives incrementality scores. The scores are meaningless — there is no seasonality baseline, no comparable periods, insufficient data for the statistical model to be confident. But they look real. The brand acts on them, gets bad results, and churns — blaming the tool.

**Prevention:**
- Enforce the 1-year data minimum as a hard gate before running the first analysis. Show a progress bar ("You have 7 months of data. Analysis unlocks at 12 months.") rather than running the model on insufficient data
- Allow connection and data ingestion before the minimum is reached — let users get data flowing — but gate the analysis output until the minimum is met
- Distinguish between "first analysis" (strict minimum: 1 year) and "ongoing analysis" (can run on rolling windows with appropriate warnings)

**Phase to address:** Phase 2 (onboarding flow)

**Confidence:** MEDIUM (derived from the project's own stated constraint; the specific implementation choice is a product decision)

---

### Pitfall 12: Attribution Window Mismatch Between Ad Platforms and Revenue Data

**What goes wrong:** Meta reports conversions on a 7-day click, 1-day view window. Shopify records orders at the moment of purchase. A campaign ran October 1-7. Meta reports 50 conversions for that campaign in its window. But the Shopify orders from clicks on October 7 may have arrived by October 14 (7-day window). When you compare October 1-7 campaign spend against October 1-7 Shopify revenue, you're missing the revenue tail from that campaign's conversions.

**Prevention:**
- Define the analysis window as campaign period + attribution tail (minimum 7 days, ideally 14-30 days depending on product category)
- Never compare campaign spend period to identical calendar revenue period — always include the attribution tail
- For products with long consideration cycles (e.g., high-ticket items), make the attribution tail configurable and default it to 30 days
- Document the attribution window assumption in the model metadata so users understand what window the analysis covers

**Phase to address:** Phase 1 (data model design) and Phase 2 (Shopify integration)

**Confidence:** MEDIUM

---

### Pitfall 13: Overfitting to Account-Level Patterns During Multi-Account Scaling

**What goes wrong:** The statistical model is tuned on the first 10-20 client accounts during beta. These accounts have similar characteristics (e.g., all mid-tier DTC Shopify stores in the US). When the platform onboards a lead gen brand or a multi-market brand with unusual seasonality, the model performs poorly because it was implicitly calibrated for a narrow account type.

**Prevention:**
- Document model assumptions explicitly and test against at least one representative account per vertical (ecommerce vs. lead gen) and per market structure (single-market vs. multi-market) before general launch
- Build per-account model configurations — the model should adapt to account characteristics rather than applying global defaults
- Maintain a model performance tracking dashboard (predicted vs. actual outcomes for accounts that ran recommendations) — model drift should be visible before clients notice it

**Phase to address:** Phase 1 (model architecture), Phase 5 (quality/monitoring)

**Confidence:** MEDIUM

---

### Pitfall 14: Background Job Queue Data Leakage Across Tenants

**What goes wrong:** A background job processes incrementality analysis for Account A. It completes and dispatches a "send email notification" job. That notification job doesn't carry the original tenant context correctly. The email goes to the wrong account's contact.

**Prevention:**
- All async jobs must explicitly include `tenant_id` in the job payload — never derive tenant context from session state in background workers
- Test notification and async processing flows specifically for tenant correctness — not just that they work, but that they work for the right tenant

**Phase to address:** Phase 3 (background job architecture)

**Confidence:** HIGH (standard multi-tenant job queue pattern)

---

### Pitfall 15: Platform-Reported Attribution Window Changes Corrupting Historical Comparisons

**What goes wrong:** Meta changes their default attribution window from 28-day click to 7-day click (this actually happened in 2021). Historical data stored under the old window is not comparable to new data stored under the new window. A year-over-year comparison using this data is invalid. The model doesn't know the window changed.

**Prevention:**
- Store the attribution window configuration alongside every data pull as metadata
- When attribution windows change, back-fill historical data under the new window (most platforms allow this via the API with window parameters)
- Alert when a platform API response reports a different attribution window than the one stored for that account
- In the model, attribution window is a first-class feature — not an assumption

**Phase to address:** Phase 2 (API integrations), Phase 1 (data model)

**Confidence:** MEDIUM (the Meta 28-day deprecation is historical fact; other platform changes are pattern-based)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Statistical engine design | Confounding correlation with causality | Use BSTS or MMM with causal structure; never naive regression |
| Statistical engine design | Saturation curve missing | Model spend-response curve; don't assume linear returns |
| Statistical engine design | Seasonality not decomposed before modeling | STL/Prophet decomposition before incrementality model runs |
| Data model design | Ground truth source unclear | Shopify/CRM is always the revenue/lead target; never platform conversions |
| Data model design | No tenant isolation at schema level | RLS from day one; `tenant_id` on every client data table |
| Data model design | Attribution window not stored as metadata | Explicitly store window config with every data record |
| Shopify integration | Platform attribution inflation ingested as ground truth | Use only order-level data from Shopify, not Shopify's attribution layer |
| Ad platform integrations | Rate limits causing silent data gaps | Idempotent ingestion, completeness flags, explicit retry with backoff |
| Ad platform integrations | Schema changes breaking ingestion silently | Schema validation on every response; loud failure preferred over silent null |
| CRM integrations | Raw lead counts used without deduplication | Deduplicate on email/phone/name before model input |
| CRM integrations | All CRM records treated as "leads" | Require users to specify qualified lead stage/status at connection |
| Geo/market segmentation | Cross-market signal contamination | Enforce campaign geo target → revenue market mapping in model |
| Geo/market segmentation | Geo targets not stored as structured data | Parse geo targets at ingestion, not at analysis time |
| Multi-tenant auth | Application-level tenant scoping only | Enforce RLS at DB level; application filter is defense-in-depth only |
| Reporting/UX | Simplified view hides actionable uncertainty | If confidence is LOW, show "more data needed" not a fake confident number |
| Reporting/UX | Analyst view lacks contextual explanation | Explain statistical terms in context; don't assume statistical literacy |
| Background jobs | Tenant context lost in async processing | Always include tenant_id in job payload; never derive from session |
| Model quality over time | Overfitting to early beta accounts | Track predicted vs. actual outcomes; document model assumptions |

---

## Sources

**Note:** All findings in this document are based on training knowledge (cutoff August 2025). Web search and web fetch tools were unavailable during this research session. The following source categories informed these findings — URLs should be verified before using as authoritative references in documentation:

- Meta Marketing API Developer Documentation (developers.facebook.com/docs/marketing-api) — rate limits, attribution window history, API versioning
- Google Ads API Developer Documentation (developers.google.com/google-ads/api) — quotas, field deprecations
- Facebook's "Lifting the Hood on Incrementality" (2021-2023 blog posts) — incrementality testing methodology
- Robyn (Meta open-source MMM) documentation — saturation curve patterns, MMM methodology
- PostgreSQL Row Level Security documentation (postgresql.org/docs) — RLS implementation
- Google's Causal Impact R package documentation — BSTS methodology for incrementality
- "Marketing Mix Modeling: A CEO's Guide" (Nielsen, 2022-2024 editions) — MMM pitfalls
- Attribution window deprecation history: Meta 28-day → 7-day click default change (2021)
- Shopify Partners API documentation — order data structure and attribution
- CRM data quality: HubSpot duplication documentation, Salesforce data quality guides

**Confidence by area:**
| Area | Confidence | Reason |
|------|------------|--------|
| Statistical modeling pitfalls | MEDIUM | Well-documented domain; specific model choices need validation |
| Ad platform API pitfalls | MEDIUM | Rate limits and schema changes are known; current values need verification |
| Multi-tenant isolation | HIGH | Standard SaaS security pattern; PostgreSQL RLS is stable and well-documented |
| CRM data quality | MEDIUM | Well-known industry problem; CRM-specific dedup APIs need current verification |
| Seasonality modeling | MEDIUM | Standard time-series knowledge; specific decomposition method choice needs expert review |
| Attribution window pitfalls | MEDIUM | Historical facts plus pattern-based inference |
| UX dual-audience pitfalls | MEDIUM | Pattern-based; requires user research to validate thresholds |
