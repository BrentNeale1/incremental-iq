# Architecture Patterns

**Domain:** Marketing analytics SaaS — incremental lift measurement with multi-source data ingestion
**Researched:** 2026-02-24
**Confidence:** MEDIUM (training knowledge; external research tools unavailable in this session)

---

## Recommended Architecture

The platform follows a **layered analytics pipeline** pattern. Raw data flows inward from external APIs through an ingestion layer, gets normalized and stored, is processed by statistical models, and surfaces through a dual-audience presentation layer. Multi-tenancy is enforced at the data layer, not the application layer.

```
External APIs (Google Ads, Meta, TikTok, Snapchat, GSC, Shopify, HubSpot, Salesforce, GHL, Zoho, GA4)
        |
        v
[ INGESTION LAYER ]
  - Connector workers per API source
  - Rate limit management
  - Credential vault (per tenant)
  - Raw data storage (immutable landing zone)
        |
        v
[ NORMALIZATION LAYER ]
  - Unified campaign/metric schema
  - Market / geo segmentation tagging
  - Entity resolution (campaign → channel → account)
  - Tenant isolation enforcement
        |
        v
[ STORAGE LAYER ]
  - Time-series optimized database
  - Raw fact tables (immutable)
  - Aggregated materialized views
  - Seasonality event registry
        |
        v
[ ANALYTICS ENGINE ]
  - Statistical forecasting (baseline predictions)
  - Incrementality scoring per campaign
  - Geo-based test framework
  - Seasonality detection
  - Confidence interval computation
  - Recommendation engine
        |
        v
[ API LAYER ]
  - REST/GraphQL API
  - Auth + RBAC (agency / specialist / client / owner roles)
  - Tenant-scoped data access
        |
        v
[ PRESENTATION LAYER ]
  - Business owner view (simplified summaries)
  - Analyst view (confidence intervals, methodology detail)
  - Onboarding flow (source connection, market confirmation, seasonality questionnaire)
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **Connector Workers** | Authenticate with external APIs, fetch raw campaign/revenue/lead data on schedule | Credential Vault, Raw Storage, Job Queue |
| **Credential Vault** | Securely store OAuth tokens and API keys per tenant | Connector Workers, Onboarding Flow |
| **Job Queue / Scheduler** | Trigger ingestion runs (hourly/daily per source), retry failed pulls | Connector Workers, Analytics Engine jobs |
| **Raw Storage (Landing Zone)** | Immutable append-only store for all raw API responses | Connector Workers, Normalization Layer |
| **Normalization Layer** | Transform API-specific schemas into unified campaign/metric/market model | Raw Storage, Analytics DB |
| **Analytics DB** | Store normalized time-series facts, materialized aggregates, seasonality events | Normalization Layer, Analytics Engine, API Layer |
| **Seasonality Registry** | Catalog of known retail events (BFCM, etc.) + brand-specific confirmed periods | Analytics Engine, Onboarding Flow |
| **Analytics Engine** | Run statistical models: baseline forecasting, incrementality scoring, geo tests | Analytics DB, Seasonality Registry, Recommendation Engine |
| **Recommendation Engine** | Convert model outputs into ranked, confidence-scored budget recommendations | Analytics Engine, API Layer |
| **API Layer** | Serve tenant-scoped data and recommendations to the frontend | Analytics DB, Analytics Engine, Auth System |
| **Auth + RBAC** | Enforce roles: agency-admin, specialist (multi-client), client-owner, brand-owner | API Layer, all data-access points |
| **Frontend — Owner View** | Simple summaries: "Increase Campaign X by $5K, expect 25-35% more revenue" | API Layer |
| **Frontend — Analyst View** | Full methodology detail: p-values, confidence intervals, methodology type | API Layer |
| **Onboarding Flow** | Connect sources, confirm geo markets, run seasonality questionnaire | Connector Workers, Credential Vault, Seasonality Registry |

---

## Data Flow

### Ingestion Flow (runs on schedule, per source, per tenant)

```
External API → Connector Worker → Rate Limiter → Raw Landing Zone (immutable)
                                                        |
                                                  Normalization Job
                                                        |
                                         Unified schema → Analytics DB
```

**Key principle:** Raw data is never modified after landing. Normalization is a separate transformation step. This allows re-running normalization logic when schemas change without re-fetching from APIs.

### Analysis Flow (triggered after new data lands, or on-demand)

```
Analytics DB (time-series facts)
        |
        +-- Baseline Forecasting Model (what would revenue be without campaign?)
        |         |
        |         v
        +-- Incrementality Scorer (actual - baseline = incremental lift, per campaign)
        |         |
        |         v
        +-- Confidence Calculator (statistical significance, data sufficiency check)
        |         |
        |         v
        +-- Seasonality Engine (adjust for known/detected seasonal patterns)
        |         |
        |         v
        +-- Recommendation Engine (scale up / hold / reduce, with confidence score)
                  |
                  v
           API Layer → Frontend
```

### Geo-Based Test Flow

```
User selects test markets + control markets
        |
        v
Geo Test Runner (isolates market data, pre/post comparison)
        |
        v
Market Difference Calculator (DID: difference-in-differences)
        |
        v
Confidence Assessment → Recommendation
```

### Onboarding Flow (one-time, per account)

```
User connects source → OAuth / API key → Credential Vault
        |
        v
Historical data pull (1-3 years lookback per source)
        |
        v
Geo market detection from campaign targeting data
        |
        v
User confirms markets (UI step)
        |
        v
First analysis run → Seasonality questionnaire (post-first-analysis)
        |
        v
User confirms / adds seasonal periods → Seasonality Registry
        |
        v
Account ready for ongoing analysis
```

---

## Patterns to Follow

### Pattern 1: Immutable Raw Landing Zone

**What:** Store all raw API responses as-is before any transformation. Never update or delete raw records — only append.

**When:** Always. Every ingestion job writes to raw storage before normalization.

**Why:** API schemas change, normalization logic evolves, and bugs in transformation must be correctable without re-fetching. The raw layer is your source of truth for re-processing.

```
raw_api_pulls
  id         UUID
  tenant_id  UUID
  source     enum (google_ads, meta, tiktok, shopify, ...)
  pulled_at  TIMESTAMP
  api_params JSONB  -- what query was issued
  payload    JSONB  -- raw API response, unmodified
  normalized BOOL   -- has this been processed by normalization layer?
```

### Pattern 2: Tenant-Isolated Row-Level Security

**What:** Every analytics table includes `tenant_id`. The API layer enforces tenant scoping on every query. Row-Level Security (RLS) at the database layer provides defense-in-depth.

**When:** Applied to all tables that store customer data. Not optional — build from day one.

**Why:** Multi-tenant data leaks are company-ending events. RLS at DB layer means a bug in application code cannot expose another tenant's data.

```sql
-- Example RLS policy (PostgreSQL)
CREATE POLICY tenant_isolation ON campaigns
  USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Pattern 3: Async Analytics Computation with Job Queue

**What:** Statistical modeling jobs run asynchronously via a job queue, not in request/response cycles. The API layer returns job status and cached results.

**When:** For any computation that takes more than 2 seconds — baseline modeling, full incrementality runs, seasonality detection.

**Why:** Statistical models over 1-3 years of daily campaign data across 10+ sources can take minutes. Blocking HTTP requests will time out. Cache results aggressively; invalidate on new data.

```
POST /api/analyses/trigger → returns job_id
GET  /api/analyses/:job_id  → returns { status: "running" | "complete", result: ... }
```

### Pattern 4: Dual-Schema Output (Owner vs. Analyst)

**What:** Statistical outputs are stored once but served in two representations. A transformation layer converts technical model outputs into business-language summaries.

**When:** Every recommendation and prediction output.

**Why:** The business owner sees "Increase Campaign X budget by $5,000/mo, expect 28-35% more conversions." The analyst sees the underlying confidence interval [0.28, 0.35], p-value 0.04, methodology: synthetic control, n=180 days. Same underlying data, two views.

```typescript
interface AnalysisResult {
  // Stored once in DB
  incrementalLift: { lower: number; upper: number; pointEstimate: number };
  pValue: number;
  methodology: "synthetic_control" | "time_series_did" | "geo_test";
  dataSufficiency: "strong" | "moderate" | "weak";

  // Derived at serve time
  ownerSummary: string;       // "Increase by $X, expect Y-Z% more revenue"
  analystDetail: AnalystView; // Full statistical breakdown
}
```

### Pattern 5: Connector Abstraction Interface

**What:** Each external API source is a connector that implements a common interface. The ingestion orchestrator is source-agnostic.

**When:** From the first connector built. Retrofitting an abstraction after 11 connectors are written is painful.

**Why:** Enables adding new connectors (WooCommerce, Pinterest Ads, etc.) without changing orchestration logic. Also makes testing easier — mock the interface, not individual APIs.

```typescript
interface DataConnector {
  source: DataSource;
  testConnection(credentials: Credentials): Promise<ConnectionResult>;
  fetchHistorical(tenantId: string, from: Date, to: Date): AsyncGenerator<RawRecord>;
  fetchIncremental(tenantId: string, since: Date): AsyncGenerator<RawRecord>;
  getRateLimitBudget(): RateLimitConfig;
}
```

### Pattern 6: Seasonality Registry as First-Class Entity

**What:** Seasonality events (BFCM, brand-specific peaks, confirmed anomalies) are stored in a dedicated registry table linked to tenant accounts. The analytics engine queries this registry before scoring any time period.

**When:** Built during the analytics engine phase, populated during onboarding and ongoing user confirmation.

**Why:** Treating seasonality as data (not hard-coded logic) allows tenant-specific seasonal profiles. A swimwear brand and a tax prep firm have different seasonal calendars — both need accurate baseline predictions that don't confuse seasonal spikes with campaign lift.

```
seasonality_events
  id           UUID
  tenant_id    UUID
  event_type   enum (known_retail, brand_confirmed, data_detected)
  name         text  -- "Black Friday 2024", "Summer Peak", etc.
  start_date   DATE
  end_date     DATE
  impact_type  enum (uplift, suppression)
  magnitude    FLOAT  -- estimated % impact on baseline
  confirmed    BOOL   -- user-confirmed vs. auto-detected
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Computing Analytics in the API Layer

**What:** Running statistical models inline during API request handling.

**Why bad:** Models over 1-3 years of daily data take seconds to minutes. HTTP timeouts will fire. Users will see errors instead of results. The database will be hammered during peak web traffic.

**Instead:** Job queue for all model runs. API layer reads cached results. Invalidate cache on new data ingestion. Show "analysis running" state with progress feedback.

---

### Anti-Pattern 2: Shared Tables Without Tenant Isolation

**What:** Building analytics tables without `tenant_id` and planning to "add multi-tenancy later."

**Why bad:** Retrofitting RLS and tenant isolation into a schema with millions of rows is an operational nightmare requiring downtime, migrations, and thorough regression testing. A data leak before this is fixed can be fatal.

**Instead:** `tenant_id` is a non-nullable column on every data table from day one. Enable PostgreSQL RLS policies at schema creation. Test cross-tenant isolation before first user.

---

### Anti-Pattern 3: Normalization Directly in Connectors

**What:** Having each connector transform data into the unified schema as it writes.

**Why bad:** When the unified schema changes (and it will), you must update all 11 connectors. When normalization has a bug, you must re-fetch from external APIs to fix it (hitting rate limits, risking data gaps).

**Instead:** Connectors write raw payloads verbatim. A separate normalization layer reads raw records and produces normalized output. Schema evolution only requires updating normalization logic.

---

### Anti-Pattern 4: Single Attribution Model for All Business Types

**What:** Using one incrementality model without accounting for ecommerce vs. lead gen business types, or for market geography.

**Why bad:** A Shopify revenue signal and a HubSpot lead signal have different lag times, conversion volumes, and noise characteristics. A US campaign spend spike should not be correlated with Australian revenue data.

**Instead:** Attribution model selects methodology based on: (1) business type (ecommerce / lead gen), (2) market scope (per-market segmentation enforced), (3) data sufficiency (3 years of data allows synthetic control; 1 year may require simpler time-series DID).

---

### Anti-Pattern 5: Overloading the Application Database for Time-Series Analytics

**What:** Storing all time-series campaign metrics in a standard relational DB with no partitioning strategy, then running analytical queries over millions of rows.

**Why bad:** A query like "give me daily spend + conversions for all campaigns for this tenant for the past 3 years" over a standard Postgres table with 11 sources and many campaigns becomes slow at scale. Analytics dashboards will feel sluggish.

**Instead:** Time-series partitioning (Postgres PARTITION BY RANGE on date) for fact tables. Materialized views for common aggregations (weekly, monthly rollups per campaign). TimescaleDB extension is worth evaluating for time-series optimized queries. Pre-compute aggregations during ingestion, not at query time.

---

## Component Build Order (Dependencies)

The following order respects hard dependencies — later components cannot function without earlier ones.

```
Phase 1: Foundation
  Auth + RBAC system          ← everything needs identity
  Multi-tenant DB schema      ← everything needs tenant isolation
  Credential Vault            ← connectors need this before connecting

Phase 2: Ingestion Infrastructure
  Job Queue / Scheduler       ← connectors run on schedule
  Connector abstraction       ← interface must exist before implementations
  First connector (Shopify)   ← revenue data gates analytics for ecommerce
  First ad connector (Google or Meta) ← needed to test analytics
  Raw Landing Zone schema     ← connectors write here
  Normalization Layer         ← runs after raw data lands

Phase 3: Storage + Retrieval
  Analytics DB schema         ← normalized facts, partitioned time-series
  Materialized aggregates     ← needed for dashboard performance
  Seasonality Registry        ← needed by analytics engine

Phase 4: Analytics Engine
  Baseline forecasting model  ← required before incrementality scoring
  Incrementality scorer       ← requires baseline
  Confidence calculator       ← wraps scoring outputs
  Seasonality engine          ← adjusts baselines, requires registry
  Geo test framework          ← parallel path to statistical approach

Phase 5: Recommendations
  Recommendation engine       ← requires scored incremental lift + confidence
  Dual-view output transform  ← owner summary + analyst detail

Phase 6: Remaining Connectors
  TikTok, Snapchat, GSC       ← ad platform connectors (interface already built)
  HubSpot, Salesforce, GHL, Zoho ← CRM connectors for lead gen
  GA4                         ← fallback lead source

Phase 7: Presentation Layer
  API Layer (full)            ← surfaces all engine outputs
  Owner Dashboard             ← simple view
  Analyst Dashboard           ← detailed view
  Onboarding Flow             ← source connection + market confirmation + seasonality questionnaire

Phase 8: Creative Data Architecture
  Creative schema/models      ← data model ready, no UI (v1 scope per PROJECT.md)
```

**Key dependency constraints:**
- Analytics engine CANNOT run without at least 2 data sources (ad spend + revenue/leads)
- Onboarding flow requires Credential Vault + at least one connector per category
- Seasonality questionnaire must follow first analysis run (post-onboarding)
- Geo-based testing requires market tagging which happens in normalization layer

---

## Scalability Considerations

| Concern | At 50 tenants | At 500 tenants | At 5,000 tenants |
|---------|--------------|---------------|-----------------|
| **Ingestion load** | Single job queue, cron-based | Distributed workers per source type | Dedicated worker pools per source, backpressure control |
| **Storage** | Single Postgres instance with partitioning | Read replicas for analytics queries | Separate OLAP layer (ClickHouse or BigQuery) for analytics workloads |
| **Analytics compute** | Background jobs on app server | Dedicated compute cluster for model runs | Isolated analytics compute (Python workers, possibly ML serving layer) |
| **API layer** | Single server, caching layer | Horizontal scaling, Redis cache | CDN for static outputs, cache hierarchy |
| **Multi-tenancy isolation** | RLS + tenant_id | RLS + connection pooling (PgBouncer) | Consider schema-per-tenant above certain sizes |
| **Connector rate limits** | Per-tenant token management | Rate limit queues per API source | Federated token pools with priority queuing |

**Architectural trigger points:**
- At ~200 tenants, analytics compute likely needs to move off the app server to dedicated workers
- At ~500 tenants with 11 API sources, ingestion parallelism and rate limit management becomes a dedicated concern
- At ~1,000 tenants, OLAP read separation from OLTP write path becomes important for query latency

---

## Technology Alignment Notes

These architectural decisions align with specific technology choices (to be confirmed in STACK.md):

| Architecture Component | Likely Technology | Confidence |
|------------------------|------------------|------------|
| Background job queue | BullMQ (Node.js) or Celery (Python) | MEDIUM |
| Time-series analytics DB | PostgreSQL + TimescaleDB extension | MEDIUM |
| Credential storage | HashiCorp Vault or AWS Secrets Manager | MEDIUM |
| Row-level security | PostgreSQL RLS policies (native) | HIGH |
| Statistical modeling | Python (statsmodels, scipy, scikit-learn) | MEDIUM |
| API layer | Node.js/TypeScript (Next.js API routes or Express) | MEDIUM |
| Frontend | Next.js (React) | MEDIUM |
| Caching | Redis | HIGH (standard for this pattern) |

---

## Sources

- Architecture patterns derived from training knowledge of marketing analytics SaaS platforms (Measured, Rockerbox, Triple Whale, Northbeam, Amplitude) — MEDIUM confidence
- Multi-tenant SaaS data isolation patterns (Row-Level Security) — HIGH confidence (well-established, documented in PostgreSQL official docs)
- Async analytics computation pattern — HIGH confidence (industry-standard for compute-heavy analytics)
- Immutable raw landing zone pattern — HIGH confidence (standard data lake / ELT pattern)
- External research tools (WebSearch, WebFetch, Brave API) unavailable in this session — gaps flagged where verification would increase confidence

**Note:** All external tool calls were denied in this research session. Architecture recommendations are based on (1) the detailed PROJECT.md requirements, (2) training knowledge of comparable platforms (Measured, Rockerbox, Northbeam, Triple Whale, Amplitude), and (3) well-established data engineering patterns. Phase-specific research sessions should verify specific library choices, TimescaleDB vs. ClickHouse tradeoffs, and current API rate limit specifications for each ad platform connector.
