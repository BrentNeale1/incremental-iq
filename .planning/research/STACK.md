# Technology Stack

**Project:** Incremental IQ — Incremental Lift Measurement Platform
**Researched:** 2026-02-24
**Research Mode:** Ecosystem (Stack dimension)

> **Research Constraints:** WebSearch and WebFetch tools were unavailable during this research session.
> Findings are based on training data (cutoff: August 2025) supplemented by known ecosystem state.
> All confidence levels reflect this constraint honestly. Verify versions against official docs before implementation.

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Next.js | 15.x | Full-stack web framework | App Router with Server Components gives optimal split between static marketing, auth-gated app, and API routes in one deployment. The `/app` directory colocation model suits the dual-audience UI pattern (simple/detailed views). |
| TypeScript | 5.x | Type safety across full stack | Shared types between frontend and API layer eliminate an entire class of integration bugs. Critical when modeling complex statistical output shapes (confidence intervals, ranges). |
| React | 19.x | UI library | Ships with Next.js 15; React 19 concurrent features (Suspense, transitions) are important for analytics dashboards with heavy data fetching. |

**Confidence:** MEDIUM — Next.js 15 was released Oct 2024 and is stable as of training cutoff. React 19 released Dec 2024. Verify current patch versions before scaffolding.

---

### Authentication & Multi-Tenancy

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Better Auth | 1.x | Auth library | The 2025 standard for Next.js multi-tenant auth. Supports organizations (tenants), role-based access, session management, and OAuth providers. More batteries-included than Auth.js for multi-tenant use cases without the managed service cost of Clerk ($25+/month scales poorly for agencies). |
| Zod | 3.x | Schema validation | Validates all API inputs, especially OAuth callback payloads and webhook bodies from ad platforms. Pairs with TypeScript for end-to-end type inference. |

**Why not Clerk:** Clerk is excellent DX but pricing becomes prohibitive at agency scale (per-MAU pricing). For a platform where an agency account has 50+ client logins, Better Auth or Auth.js with Prisma adapter is the cost-controlled alternative.

**Why not Auth.js (NextAuth v5):** Better Auth has a cleaner organization/multi-tenant model out of the box as of 2025. Auth.js organizations support requires more custom work. Both are viable; Better Auth is recommended for this use case.

**Confidence:** MEDIUM — Better Auth v1 launched 2024 and rapidly became community-recommended for multi-tenant Next.js. Verify current API stability and organization feature completeness before committing.

---

### Primary Database

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PostgreSQL | 16.x | Primary relational store | Multi-tenant data isolation via Row-Level Security (RLS), JSONB for flexible API response caching, mature ecosystem. Handles the relational aspects: accounts, campaigns, integrations, recommendations. |
| TimescaleDB | 2.x | Time-series extension for PostgreSQL | Campaign spend, impressions, revenue, and lead data are time-series by nature. TimescaleDB hypertables provide automatic partitioning by time, continuous aggregates for pre-computed rollups, and compression — all without leaving PostgreSQL. Critical for the "years of historical data" requirement. |

**Why TimescaleDB over ClickHouse:**
- TimescaleDB runs as a PostgreSQL extension — same database, same ORM, same connection pool, same migration tooling
- ClickHouse requires a separate service, separate query language, and bidirectional sync complexity
- At the scale of mid-tier ecommerce brands (thousands of rows/day per account), TimescaleDB handles the load without ClickHouse's operational overhead
- ClickHouse becomes relevant at 100M+ rows/day; revisit if platform reaches 10K+ active accounts with years of daily data

**Why not just PostgreSQL without TimescaleDB:**
- Without hypertables, time-range queries over 3 years of daily campaign data (potentially millions of rows per account) degrade significantly
- Continuous aggregates replace the need for a separate caching layer for computed metrics
- Compression ratios of 10-20x on time-series data reduce storage costs significantly

**Confidence:** HIGH — PostgreSQL + TimescaleDB is the established pattern for analytics products with time-series requirements that don't need a full OLAP system.

---

### ORM / Query Layer

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Drizzle ORM | 0.38.x | Database access layer | TypeScript-first, generates raw SQL (no N+1 surprises), excellent TypeScript inference for complex queries, and critically: supports raw SQL escape hatches for TimescaleDB-specific functions (time_bucket, continuous aggregates). Drizzle's schema definition doubles as the source of truth for migrations. |

**Why not Prisma:**
- Prisma's query engine abstraction makes it harder to use TimescaleDB-specific functions
- Prisma generates more verbose SQL; Drizzle gives you full control
- Prisma's typed client is excellent but Drizzle's is equally typed and faster (no Rust query engine subprocess)
- For an analytics platform where query performance matters, Drizzle's transparency is a structural advantage

**Confidence:** MEDIUM — Drizzle reached v0.30+ in 2024 with strong ecosystem adoption. TimescaleDB raw SQL compatibility is well-documented. Verify the current version is still in 0.x (not yet 1.0 stable) before treating API as final.

---

### Statistical / ML Backend

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Python | 3.12.x | Statistical modeling runtime | R, Julia, and Python all support the required statistics. Python wins because: (1) the ML ecosystem is Python-first, (2) Meta's Prophet, Google's Causal Impact port, and statsmodels all have Python as primary target, (3) hiring is easiest. |
| FastAPI | 0.115.x | Python microservice API | Async, auto-generates OpenAPI spec, Pydantic v2 for data validation, 10x faster than Flask/Django for I/O-bound statistical jobs. The Next.js API layer calls this service for model runs. |
| statsmodels | 0.14.x | Statistical modeling | ARIMA, SARIMA, VAR models for time-series forecasting. Handles the core incrementality regression models. Production-grade, peer-reviewed implementations. |
| Prophet | 1.1.x | Seasonality decomposition | Facebook's time-series forecasting library. Handles the seasonality detection requirement — brand-specific seasonal patterns with Fourier series decomposition. Works well with yearly, weekly, and holiday seasonality. |
| scikit-learn | 1.5.x | ML utilities | Preprocessing, cross-validation, feature importance. Used to support the statistical models rather than replace them. |
| scipy | 1.14.x | Scientific computing | p-value calculations, confidence interval computation, hypothesis testing — the core of confidence threshold reporting. |
| pandas | 2.2.x | Data manipulation | Time-series data wrangling, resampling for multi-period analysis. Essential for pre/post analysis and geo-based test grouping. |
| CausalPy | 0.4.x | Causal inference | Built on PyMC, provides Bayesian causal impact analysis. Use for geo-based testing where you need posterior distributions rather than frequentist p-values. |

**Architecture note:** The Python statistical service is a separate Docker container called by the Next.js API layer via internal HTTP. It is NOT deployed as serverless functions — statistical models need persistent memory for model caching and Bayesian sampling takes too long for cold-start environments.

**Why not a pure JavaScript statistical approach:**
- `ml.js`, `tensorflow.js`, and `simple-statistics` are inadequate for production Bayesian inference, SARIMA with exogenous variables, or geo-based synthetic control methods
- The statistical complexity required (causal inference, time-series with multiple seasonalities) demands the Python scientific ecosystem
- Python service as a sidecar is the standard pattern for analytics products (Mixpanel, Amplitude analytics backends use Python)

**Confidence:** HIGH for Python choice. MEDIUM for specific library versions (these update frequently; verify before implementation). CausalPy confidence is LOW — relatively new library, verify production readiness.

---

### Background Jobs / Data Ingestion Pipeline

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| BullMQ | 5.x | Job queue | Redis-backed queue for ad platform data ingestion jobs, statistical model runs, and scheduled syncs. Supports retries, backoff, priority queues, and rate limiting — all critical for working within ad platform API rate limits. |
| Redis | 7.x | Queue backend + caching | BullMQ requires Redis. Also serves as API response cache layer (cache ad platform responses to avoid hitting rate limits twice) and session store. |

**Why BullMQ over alternatives:**
- `pg-boss` (PostgreSQL-backed queue): viable but slower; PostgreSQL is already under load from analytics queries
- Cloud queues (SQS, Google Pub/Sub): adds AWS/GCP dependency, more ops complexity than Redis for a TypeScript codebase
- BullMQ is TypeScript-native, well-maintained, and the standard for Next.js + Node background jobs as of 2025

**Queue topology for this project:**
- `ingestion-queue` — polling ad platform APIs, processing responses
- `analysis-queue` — triggering Python statistical service runs
- `notification-queue` — sending recommendation alerts
- Scheduled jobs via BullMQ's repeat functionality for daily/weekly data syncs

**Confidence:** MEDIUM — BullMQ v5 is current as of training data. Verify current major version.

---

### Ad Platform & Commerce API Integrations

| Integration | Approach | Notes |
|-------------|----------|-------|
| Google Ads | `google-ads-api` npm package (v17+) | TypeScript wrapper around gRPC API. Campaign-level metrics, conversions, cost data. |
| Meta Ads | Official Marketing API via `facebook-nodejs-business-sdk` or raw `node-fetch` | The official SDK is often behind API versions; prefer raw REST calls to `/v21.0/` endpoints with typed interfaces |
| TikTok Ads | Official TikTok Business API SDK (Python or raw REST) | TikTok's SDK is Python-first; call via the FastAPI service or use raw REST from Node |
| Snapchat Ads | Snapchat Marketing API — raw REST only | No mature Node SDK; use `fetch` with typed interfaces. Rate limit: 1000 req/hour. |
| Google Search Console | `googleapis` npm package (`v144+`) | Well-maintained Google APIs client for Node. |
| Shopify | `@shopify/shopify-api` npm package (v11+) | Official Shopify Admin API SDK. Use REST Admin API for order/revenue data. |
| HubSpot | `@hubspot/api-client` (v12+) | Official Node.js SDK. CRM contacts, deals, form submissions. |
| Salesforce | `jsforce` (v3.x) | Mature Salesforce Node.js library. SOQL queries for lead/opportunity data. |
| GoHighLevel | Raw REST — no official SDK | GHL has a REST API v2 but no official SDK. Build typed wrappers. |
| Zoho CRM | `zoho-crm-sdk` or raw REST | Zoho's Node SDK exists but is minimally maintained; raw REST is more reliable. |
| GA4 | `@google-analytics/data` npm package (v5+) | Official GA4 Data API client. For lead volume fallback only. |

**Integration architecture:** All API credentials are encrypted at rest (AES-256 via `@oslojs/crypto` or similar). Per-account OAuth tokens stored in PostgreSQL with row-level tenant isolation. Background jobs handle token refresh.

**Confidence:** MEDIUM — SDK versions are from training data; ad platform SDKs update frequently. Verify all package versions on npm before implementation. The raw REST approach for SDKs that lag their API versions is consistently recommended over stale SDKs.

---

### Frontend UI

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Tailwind CSS | 4.x | Styling | v4 ships with Vite-based tooling and CSS-first config (no `tailwind.config.js` required). Eliminates the need for a separate CSS preprocessor. Standard for Next.js as of 2025. |
| shadcn/ui | Latest (not versioned) | Component library | Copies components into your codebase (not an npm dependency), Radix UI primitives underneath, fully customizable. The dual-audience requirement (simple for business owners, detailed for analysts) is implemented as view-mode toggles on the same shadcn components. |
| Recharts | 2.x | Data visualization | React-native charting library. More customizable than Chart.js for custom confidence interval visualizations, shaded regions, and annotation overlays. Used for time-series lift charts, geo maps, and confidence band displays. |
| Tanstack Table | 8.x | Data tables | Headless table library for the detailed analyst view — sortable, filterable, virtual-scrolling for large campaign datasets. |
| Tanstack Query | 5.x | Server state management | Data fetching, caching, and background refetch for dashboard data. Works naturally with Next.js server components where needed. |

**Why not a component library like MUI or Chakra:**
- shadcn/ui gives full control over styling without fighting a design system
- The dual-audience requirement means custom view-mode behavior that's easier with your own components
- MUI and Chakra add significant bundle weight for components you'll heavily override anyway

**Confidence:** HIGH for Tailwind 4 (released early 2025) and shadcn/ui. MEDIUM for Recharts v2 — check if v3 released (it was in development as of training cutoff).

---

### Infrastructure & Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Railway | Current | Primary deployment platform | Supports both Node.js (Next.js) and Python (FastAPI) services in one project. PostgreSQL with TimescaleDB via custom Docker image. Redis built-in. Better cost/performance than Vercel + separate Python hosting for this architecture. |
| Docker | 25.x+ | Container runtime | Python FastAPI service MUST be containerized. Also containerize the worker process (BullMQ) separately from the web process. |
| GitHub Actions | N/A | CI/CD | Standard CI for tests, linting, type-checking, and Railway deploys. |

**Why not Vercel:**
- Vercel is serverless-only; the Python statistical service and BullMQ workers cannot run serverless
- Long statistical model runs (30-120 seconds for Bayesian inference) exceed serverless timeout limits
- Vercel + Railway for Python would work but adds complexity vs. Railway for everything

**Why not AWS/GCP directly:**
- Operational overhead is not justified at MVP scale
- Railway abstracts the container orchestration while keeping escape hatches (custom Docker images, persistent volumes)
- Migrate to ECS/GKE when Railway costs justify it (typically 50K+ MAU)

**Alternative if Vercel is preferred:** Use Vercel for Next.js, Railway for Python FastAPI + BullMQ workers, and Supabase for managed PostgreSQL with TimescaleDB. This is slightly more complex but fully viable.

**Confidence:** MEDIUM — Railway is the 2024-2025 recommended platform for this architecture type. Verify current pricing and TimescaleDB support via custom Docker images.

---

### Observability & Monitoring

| Technology | Purpose | Why |
|------------|---------|-----|
| Sentry | Error tracking | Standard SDK for Next.js + Python. Captures exceptions with full context in both layers. |
| PostHog | Product analytics + feature flags | Self-hostable, privacy-compliant, captures the user events needed to understand dual-audience behavior patterns. Feature flags enable gradual rollout of the analyst-detail view. |
| OpenTelemetry | Distributed tracing | Traces requests from Next.js API through to Python statistical service. Critical for debugging slow model runs. Ship traces to Sentry, Grafana, or Honeycomb. |

**Confidence:** MEDIUM — These are well-established tools as of 2025. Verify PostHog's self-hosting vs. cloud recommendation for a new SaaS.

---

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | 2.x | Unit/integration tests | Vite-based, faster than Jest, native ESM support, excellent TypeScript support. For testing API routes, statistical result processing, and UI components. |
| Playwright | 1.x | End-to-end testing | Tests the critical user flows: OAuth connection, data sync, report generation. Browser automation with TypeScript support. |
| pytest | 8.x | Python tests | Standard Python testing for the FastAPI statistical service. Test model outputs against known datasets. |

**Confidence:** HIGH — these are the 2025 standard testing tools for this stack.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Frontend | Next.js 15 | Remix 2.x | Next.js has larger ecosystem, better Vercel/Railway integration, more Next.js-specific auth tooling. Remix is excellent but the ecosystem advantage goes to Next.js for analytics SaaS. |
| Auth | Better Auth | Clerk | Clerk's per-MAU pricing is prohibitive for agency accounts with many client logins. |
| Auth | Better Auth | Auth.js (NextAuth v5) | Auth.js requires more custom work to implement multi-tenant organizations. |
| Database | PostgreSQL + TimescaleDB | ClickHouse + PostgreSQL | Two-database architecture adds sync complexity. TimescaleDB handles the scale needed at MVP + growth phase. |
| Database | PostgreSQL + TimescaleDB | Supabase | Supabase is managed PostgreSQL (excellent option). TimescaleDB via Supabase requires the Pro plan. If managed is preferred, Supabase Pro + TimescaleDB is viable. |
| ORM | Drizzle | Prisma | Prisma's abstraction works against TimescaleDB raw SQL functions. Drizzle's transparency wins for this use case. |
| ML Service | Python FastAPI | R Plumber | Python wins on ecosystem size, library maturity, and hiring ease. R Plumber is viable but Python is standard industry choice. |
| ML Service | Python FastAPI | Serverless (AWS Lambda) | Statistical model cold starts + memory requirements make serverless inappropriate. |
| Queue | BullMQ | pg-boss | pg-boss avoids Redis dependency but PostgreSQL queue polling under analytics load is a risk. BullMQ's Redis-backed approach is more isolated. |
| Charts | Recharts | Highcharts | Highcharts requires commercial license. Recharts is MIT. Tremor charts (shadcn-based) also viable. |
| Charts | Recharts | D3.js | D3 is more powerful but requires significantly more implementation effort. Recharts provides 80% of what D3 does with 20% of the code for standard analytics charts. |
| Deployment | Railway | Render | Both are viable. Railway has better multi-service project organization and PostgreSQL + Redis built-in. |
| Deployment | Railway | AWS ECS | AWS is the right answer at scale but too much ops overhead at MVP. Migrate later. |
| Styling | Tailwind v4 | Tailwind v3 | v4 is current; start on v4. CSS-first config is cleaner. |

---

## Architecture Decision: Monorepo vs Polyrepo

**Recommendation: Monorepo (Turborepo)**

The Python statistical service, Next.js app, and shared TypeScript types benefit from monorepo colocation:
- `apps/web` — Next.js application
- `apps/api` — Python FastAPI statistical service
- `apps/worker` — BullMQ worker process (Node.js)
- `packages/types` — Shared TypeScript types for API contracts
- `packages/db` — Drizzle schema + migration files

Turborepo handles build caching and task orchestration. This prevents type drift between the Next.js API layer and the Python service contracts.

**Confidence:** MEDIUM — Turborepo monorepo with Python is workable but requires careful CI setup. The Python service won't participate in TypeScript builds but benefits from shared config and deployment coordination.

---

## Critical Version Dependencies

These versions need verification against current npm/PyPI before project scaffold:

| Package | Known Version | Check At |
|---------|--------------|----------|
| `next` | 15.x | https://www.npmjs.com/package/next |
| `react` | 19.x | https://www.npmjs.com/package/react |
| `drizzle-orm` | 0.38.x | https://www.npmjs.com/package/drizzle-orm |
| `better-auth` | 1.x | https://www.npmjs.com/package/better-auth |
| `bullmq` | 5.x | https://www.npmjs.com/package/bullmq |
| `tailwindcss` | 4.x | https://www.npmjs.com/package/tailwindcss |
| `@tanstack/react-query` | 5.x | https://www.npmjs.com/package/@tanstack/react-query |
| `recharts` | 2.x or 3.x | https://www.npmjs.com/package/recharts |
| `fastapi` | 0.115.x | https://pypi.org/project/fastapi/ |
| `prophet` | 1.1.x | https://pypi.org/project/prophet/ |
| `statsmodels` | 0.14.x | https://pypi.org/project/statsmodels/ |
| `causalpy` | 0.4.x | https://pypi.org/project/causalpy/ |

---

## Installation Scaffold

```bash
# Initialize monorepo
npx create-turbo@latest incremental-iq --package-manager pnpm

# Next.js app
cd apps/web
pnpm add next@latest react@latest react-dom@latest
pnpm add better-auth drizzle-orm @drizzle/pg-core postgres
pnpm add bullmq ioredis
pnpm add @tanstack/react-query zod
pnpm add recharts @tanstack/react-table

# Dev dependencies
pnpm add -D typescript tailwindcss@latest vitest @playwright/test
pnpm add -D drizzle-kit @types/node

# Shared DB package
cd packages/db
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit

# Python statistical service (apps/api)
# Uses pip/uv for Python dependencies
pip install fastapi uvicorn
pip install statsmodels prophet scikit-learn scipy pandas
pip install causalpy pymc  # Bayesian inference
pip install pytest httpx   # Testing
```

---

## Sources

**Note:** Due to tool restrictions during this research session, the following are authoritative sources to verify findings — they were not directly fetched but are the canonical references for each recommendation.

| Source | URL | What to Verify |
|--------|-----|----------------|
| Next.js Docs | https://nextjs.org/docs | Current stable version, App Router capabilities |
| Better Auth Docs | https://www.better-auth.com/docs | Organization/multi-tenant support, current version |
| Drizzle ORM Docs | https://orm.drizzle.team/docs | TimescaleDB raw SQL compatibility, current version |
| TimescaleDB Docs | https://docs.timescale.com | PostgreSQL 16 compatibility, hypertable limits |
| BullMQ Docs | https://docs.bullmq.io | Current version, Railway compatibility |
| FastAPI Docs | https://fastapi.tiangolo.com | Current version |
| Prophet Docs | https://facebook.github.io/prophet | Current version, Python 3.12 compatibility |
| CausalPy GitHub | https://github.com/pymc-devs/causalpy | Production readiness, API stability |
| Railway Docs | https://docs.railway.app | Custom Docker + TimescaleDB support |
| Tailwind CSS Docs | https://tailwindcss.com/docs | v4 migration guide, Next.js compatibility |
| shadcn/ui Docs | https://ui.shadcn.com | Current component availability |

**Confidence summary:**
- HIGH confidence: PostgreSQL + TimescaleDB choice, Python for statistical modeling, Tailwind v4, testing tools (Vitest/Playwright/pytest)
- MEDIUM confidence: Better Auth (verify org support), Drizzle (verify TimescaleDB raw SQL), BullMQ v5, Railway deployment, specific library versions
- LOW confidence: CausalPy production readiness (new library, limited production case studies)
