# Phase 2: Core Data Ingestion - Research

**Researched:** 2026-02-24
**Domain:** Ad platform API ingestion (Meta Marketing API, Google Ads API, Shopify Admin GraphQL API), job scheduling, OAuth token management
**Confidence:** MEDIUM-HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sync & scheduling**
- Daily overnight sync for all platforms
- Each platform syncs independently — one failure does not block others
- On partial sync failure (e.g., rate-limited after 60%), keep successfully pulled data and retry the rest on the next cycle
- Manual "Sync now" button available per integration, but rate-limited to prevent API abuse (limit the number of manual refreshes a user can trigger)

**Historical backfill**
- Auto-max backfill on first connection — pull as much history as the API allows (up to 3 years), no user prompt needed
- Allow manual override of backfill range in settings
- Show live progress during backfill per platform (e.g., "Meta Ads: 14 of 36 months pulled")
- If a source has less than 1 year of data: allow analysis but show a prominent warning that results are less reliable with limited history
- Flag gaps in historical data visually on a timeline view so user understands where data is missing

**Data freshness UX**
- Per-integration freshness badge on the integrations/settings page ("Last synced: 2h ago")
- Global summary indicator visible from the main dashboard showing freshness across all integrations
- When a sync is broken (token expired, permissions revoked): in-app warning banner AND email notification to the user
- During active sync: show last completed sync time alongside "New Sync in Progress..." label to avoid confusion
- Short sync history log per integration (last 5-7 syncs with success/partial/failed status) to help diagnose recurring issues

### Claude's Discretion
- OAuth flow UI details and connection sequence
- Exact rate limit numbers for manual refresh (how many per day)
- Specific retry logic and backoff strategy for API rate limits
- Data transformation and normalization pipeline architecture
- How to map platform-specific data structures into the unified schema

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTG-01 | User can connect Meta Ads account via OAuth and pull campaign/ad set/ad data | Meta Marketing API v23, facebook-nodejs-business-sdk, OAuth long-lived token exchange, Insights API with async reporting |
| INTG-02 | User can connect Google Ads account via OAuth and pull campaign data | Google Ads API v23, google-ads-api npm (Opteo), OAuth2 + developer token, GAQL queries |
| INTG-03 | User can connect Shopify store and pull order/revenue data | Shopify GraphQL Admin API 2025-10, @shopify/shopify-api npm, offline access tokens, bulk operations for backfill |
| INTG-05 | System backfills historical data from all connected sources (1yr min, 3yr ideal) | Platform-specific lookback limits (Meta: 37mo aggregate, Google: unlimited, Shopify: read_all_orders scope), BullMQ job scheduler, ingestion_coverage table already in schema |
</phase_requirements>

---

## Summary

Phase 2 requires building three separate API connectors (Meta, Google Ads, Shopify), an OAuth credential management layer, a job scheduling system for daily syncs and backfill, and a normalization pipeline that writes into the existing Phase 1 schema. The project currently has only `packages/db` — this phase must scaffold a new package (e.g., `packages/ingestion`) and likely a new Next.js web app (`apps/web`) for the OAuth callback UI, or at minimum a Next.js API layer for OAuth redirect handling.

Each platform has materially different API behaviors: Meta requires async report jobs for large date ranges, Google Ads uses GAQL queries with no practical historical lookback limit, and Shopify requires both a special `read_all_orders` OAuth scope and bulk operation queries for large backfills. The hardest architectural decision is where the scheduler runs — BullMQ with Redis is the standard Node.js solution and fits the daily overnight sync pattern.

**Critical discovery:** Meta restricted historical data retention for unique-count fields and breakdowns to 13 months effective January 12, 2026. For aggregate totals (spend, impressions, clicks — the core metrics needed for this application), Meta still supports up to 37 months of history. The "3 year backfill" goal is achievable for the required fields but NOT for breakdown-level unique reach metrics.

**Primary recommendation:** Use `facebook-nodejs-business-sdk` v23 for Meta, `google-ads-api` v23 (Opteo) for Google Ads, and `@shopify/shopify-api` with the GraphQL Admin API for Shopify. Schedule jobs with BullMQ backed by Redis. Encrypt OAuth tokens at rest using Node.js `crypto` (AES-256-GCM) before writing to Postgres.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `facebook-nodejs-business-sdk` | 23.x | Meta Marketing API client | Official Meta-maintained SDK; auto-tracks API versioning; supports async insights |
| `google-ads-api` | 23.x | Google Ads API client | TypeScript-native, actively maintained by Opteo; wraps gRPC complexity; supports GAQL and streaming |
| `@shopify/shopify-api` | 11.x (from shopify-app-js) | Shopify OAuth + GraphQL client | Official Shopify library; handles OAuth, session management, GraphQL proxy |
| `bullmq` | 5.x | Job queue + scheduler | TypeScript-native, Redis-backed, production-proven; replaces Bull; Job Schedulers API in v5.16+ |
| `ioredis` | 5.x | Redis client for BullMQ | Required by BullMQ; better TypeScript types than `redis` npm package |
| `p-retry` | 6.x | Retry with exponential backoff | Tiny, composable, well-tested; handles jitter; works with async functions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@shopify/admin-api-client` | latest | Thin GraphQL client for Shopify | Lower-level than shopify-api when you only need GraphQL queries |
| `p-limit` | 5.x | Concurrency control | Rate-limiting concurrent API calls to stay under platform limits |
| `date-fns` | 3.x | Date manipulation for backfill window chunking | Generating month-by-month date range arrays for historical pulls |
| `zod` | 3.x | Runtime validation of API payloads before DB writes | Catches API schema changes before they corrupt raw_api_pulls |
| `bull-board` | 5.x | BullMQ UI dashboard | Monitoring job queues during development and production ops |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `google-ads-api` (Opteo) | Official Google gRPC stubs | Official stubs require heavy gRPC setup; Opteo library is TypeScript-first with same coverage |
| BullMQ + Redis | pg-cron + postgres | pg-cron simpler infra but poor TypeScript integration and no job progress tracking; BullMQ needed for live backfill progress UX |
| BullMQ + Redis | node-cron (in-memory) | node-cron has no persistence — jobs lost on restart; unacceptable for overnight syncs |
| `@shopify/shopify-api` | Raw `fetch` + OAuth lib | shopify-api handles token refresh, expiring token rotation (Dec 2025 change), and bulk operation helpers |

**Installation:**
```bash
# In packages/ingestion (new package)
pnpm add facebook-nodejs-business-sdk google-ads-api @shopify/shopify-api bullmq ioredis p-retry p-limit date-fns zod
pnpm add -D @types/node tsx typescript
```

---

## Architecture Patterns

### Recommended Project Structure

The project is a pnpm monorepo. Phase 2 adds two new packages:

```
packages/
├── db/                        # Existing — schema, migrations
├── ingestion/                 # NEW — connector logic, scheduler, normalizer
│   ├── src/
│   │   ├── connectors/
│   │   │   ├── meta.ts        # Meta Ads API connector
│   │   │   ├── google-ads.ts  # Google Ads connector
│   │   │   └── shopify.ts     # Shopify connector
│   │   ├── oauth/
│   │   │   ├── meta.ts        # Meta OAuth + token management
│   │   │   ├── google.ts      # Google OAuth + token management
│   │   │   └── shopify.ts     # Shopify OAuth + token management
│   │   ├── normalizers/
│   │   │   ├── meta.ts        # raw_api_pulls → campaign_metrics
│   │   │   ├── google-ads.ts
│   │   │   └── shopify.ts     # orders → revenue metrics
│   │   ├── scheduler/
│   │   │   ├── queues.ts      # BullMQ queue definitions
│   │   │   ├── workers.ts     # Worker process entry point
│   │   │   └── jobs/
│   │   │       ├── sync.ts    # Daily sync job handler
│   │   │       └── backfill.ts # Historical backfill job handler
│   │   └── index.ts
│   └── package.json
apps/
└── web/                       # NEW (or deferred) — Next.js for OAuth callbacks + UI
    ├── app/
    │   ├── api/
    │   │   ├── auth/meta/callback/route.ts
    │   │   ├── auth/google/callback/route.ts
    │   │   └── auth/shopify/callback/route.ts
    │   └── integrations/      # Settings/status page
    └── package.json
```

**Decision needed:** Does the planner scaffold `apps/web` in Phase 2 (for OAuth callback routes) or build a minimal Express/Hono server instead? The OAuth callback MUST be an HTTP endpoint that the ad platform redirects to — it cannot be a background worker. Recommendation: scaffold `apps/web` as a Next.js App Router app in Phase 2, even if the UI is minimal. This avoids building throw-away infrastructure.

### Pattern 1: Two-Stage Raw → Normalized Pipeline

**What:** All API responses write to `raw_api_pulls` first (verbatim, no transformation). A separate normalizer process reads un-normalized rows and writes to `campaign_metrics`. The `normalized` flag on `raw_api_pulls` gates the second stage.

**When to use:** Always. Never write directly to `campaign_metrics` from a connector.

**Why:** If Meta changes their attribution window defaults (which they did January 2026) or a normalization rule changes, you can re-run the normalizer against existing raw data without re-hitting the API.

**Example (Drizzle upsert for campaign_metrics):**
```typescript
// Source: Drizzle ORM docs - https://orm.drizzle.team/docs/guides/upsert
await db
  .insert(campaignMetrics)
  .values({
    date: row.date,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    source: 'meta',
    spendUsd: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
  })
  .onConflictDoUpdate({
    // uniqueIndex on (tenantId, campaignId, date, source) — from Phase 1 schema
    target: [campaignMetrics.tenantId, campaignMetrics.campaignId, campaignMetrics.date, campaignMetrics.source],
    set: {
      spendUsd: sql`excluded.spend_usd`,
      impressions: sql`excluded.impressions`,
      clicks: sql`excluded.clicks`,
    },
  });
```

### Pattern 2: BullMQ Job Scheduler for Nightly Sync

**What:** Use `queue.upsertJobScheduler()` (BullMQ v5.16+) to register a nightly cron trigger per tenant per platform. Each trigger enqueues a sync job that the worker processes.

**When to use:** For all scheduled syncs. The `upsertJobScheduler` pattern is idempotent — safe to call on every deploy.

**Example:**
```typescript
// Source: BullMQ docs - https://docs.bullmq.io/guide/job-schedulers
import { Queue } from 'bullmq';

const syncQueue = new Queue('platform-sync', { connection: redisConnection });

// Called once per tenant/platform on integration connect AND on every deploy
await syncQueue.upsertJobScheduler(
  `nightly-meta-${tenantId}`,
  { pattern: '0 2 * * *' },  // 2am UTC daily
  {
    name: 'sync',
    data: { tenantId, platform: 'meta', type: 'incremental' },
    opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
  }
);
```

### Pattern 3: BullMQ Backfill Job with Progress Reporting

**What:** The backfill job chunks the date range into monthly windows and processes each chunk sequentially, updating a progress counter in the job data for the UI to poll.

**Example:**
```typescript
// In the backfill worker
worker.on('active', async (job) => {
  const { tenantId, platform, startDate, endDate } = job.data;
  const months = eachMonthOfInterval({ start: startDate, end: endDate }); // date-fns

  for (let i = 0; i < months.length; i++) {
    await pullMonthData(tenantId, platform, months[i]);
    await job.updateProgress({ completed: i + 1, total: months.length });
    // UI reads: "Meta Ads: 14 of 36 months pulled"
  }
});
```

### Pattern 4: OAuth Token Encryption at Rest

**What:** Before storing an OAuth access/refresh token in Postgres, encrypt it with AES-256-GCM using Node.js built-in `crypto`. Decrypt on read.

**Why:** Tokens grant full ad account access — plaintext storage is a catastrophic breach risk.

**Example:**
```typescript
// Uses Node.js built-in crypto — no additional library needed
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY!, 'hex'); // 32 bytes hex

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

### Pattern 5: p-retry + Respect Retry-After Headers

**What:** Wrap all API calls in `p-retry` with a custom `onFailedAttempt` that reads the platform's retry-after signal.

```typescript
// Source: p-retry npm docs
import pRetry, { AbortError } from 'p-retry';

const result = await pRetry(
  async () => {
    const response = await metaApiCall();
    if (response.error?.code === 17 || response.error?.code === 613) {
      // Meta rate limit error codes
      throw new Error('Rate limited');  // will retry
    }
    if (response.error?.code === 100) {
      throw new AbortError('Invalid parameter');  // will NOT retry
    }
    return response;
  },
  {
    retries: 5,
    factor: 2,
    minTimeout: 30_000,   // 30s base for rate limit recovery
    maxTimeout: 600_000,  // 10 min max
    randomize: true,      // jitter
  }
);
```

### Pattern 6: Shopify Bulk Operations for Backfill

**What:** For Shopify historical backfill (potentially years of orders), use the GraphQL Bulk Operations API rather than paginating through orders endpoint. Submit a `bulkOperationRunQuery` mutation, poll for completion, download the JSONL result.

**Why:** Standard GraphQL orders query is rate-limited (leaky bucket: 40 req/store for standard plans). Bulk operations are designed for exactly this use case and bypass normal rate limits.

```typescript
// Step 1: Submit bulk operation
const mutation = `
  mutation {
    bulkOperationRunQuery(query: """
      {
        orders(query: "created_at:>2023-01-01") {
          edges { node { id processedAt totalPriceSet { shopMoney { amount currencyCode } } } }
        }
      }
    """) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;

// Step 2: Poll status (every 10s for small stores, 60s for large)
// In API 2026-01+: use bulkOperation(id:) query
// In earlier versions: use currentBulkOperation query

// Step 3: Download JSONL from url field when status === 'COMPLETED'
// Parse line-by-line with a stream to avoid OOM on large datasets
```

### Anti-Patterns to Avoid

- **Direct writes to campaign_metrics:** Always land in raw_api_pulls first. Normalization is a separate step.
- **Storing OAuth tokens in plaintext:** Tokens grant full ad account access. Always encrypt at rest.
- **Single giant backfill job:** Chunk by month. One month = one retriable unit. This way partial failures (rate limit at month 18/36) don't lose progress.
- **Synchronous API calls in HTTP request handlers:** OAuth callback routes should only exchange the code for a token and persist credentials. Never initiate a backfill from an HTTP handler — enqueue a BullMQ job instead.
- **Polling Meta insights synchronously:** For date ranges larger than ~7 days at ad-level, Meta async reporting (`async: true`) is necessary. Synchronous polling for large ranges will timeout.
- **Missing RLS context in workers:** The BullMQ worker process bypasses Next.js middleware — it MUST set `app.current_tenant_id` as a Postgres session variable before every query, or use a superuser connection that bypasses RLS (with explicit tenant_id filtering in every WHERE clause). The superuser path is acceptable for the ingestion worker since it owns all data, but must be deliberate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job scheduling with cron | Custom cron runner | BullMQ Job Schedulers | Persistence, retry, progress tracking, distributed workers, UI monitoring |
| API exponential backoff | Custom sleep/retry loops | p-retry | Handles jitter, abort conditions, TypeScript types, well-tested edge cases |
| Shopify OAuth handshake | Raw OAuth 2.0 from scratch | @shopify/shopify-api | Handles HMAC verification, state param, expiring token refresh (Dec 2025 model) |
| Token encryption | ROT13 / base64 / simple AES | Node.js `crypto` AES-256-GCM | Built-in, authenticated encryption prevents tampering, no extra dependency |
| Meta API client | Raw fetch + manual pagination | facebook-nodejs-business-sdk | Handles async report polling, pagination cursors, rate limit headers |
| JSONL parsing for Shopify bulk ops | JSON.parse on full file | Line-by-line stream reader | JSONL files can be gigabytes; stream prevents OOM |

**Key insight:** Every ad platform API has substantial undocumented edge cases (rate limit error codes, async vs sync behavior thresholds, pagination cursor invalidation). Using official or well-maintained SDKs absorbs those edge cases instead of rediscovering them.

---

## Common Pitfalls

### Pitfall 1: Meta Attribution Window Data Incompatibility
**What goes wrong:** After January 12, 2026, Meta changed default attribution windows. Historical data pulled before the change used different attribution logic than data pulled after. Comparing the two produces invalid ROAS numbers.
**Why it happens:** Meta unified attribution settings mid-stream, and the API returned different values depending on when data was fetched.
**How to avoid:** Store the `attribution_window` parameter alongside every raw pull in `raw_api_pulls.attributionWindow` (this is already in the Phase 1 schema). The normalizer must surface attribution window as a dimension, not a hidden variable.
**Warning signs:** ROAS for the same campaign varies suspiciously across date ranges that span the January 2026 boundary.

### Pitfall 2: Meta 13-Month Limit for Breakdown-Level Unique Metrics
**What goes wrong:** Attempting to backfill unique-count fields (e.g., `unique_actions`, `reach` with breakdowns by age/gender/country) older than 13 months returns empty data sets or errors.
**Why it happens:** Meta enforced this retention limit effective January 12, 2026.
**How to avoid:** Only request aggregate totals (spend, impressions, clicks, total actions — not unique variants) for the historical backfill. This supports up to 37 months. Document this limitation in the UI ("Historical reach data limited to 13 months by Meta policy").
**Warning signs:** Empty arrays returned for breakdown-level queries on dates 13+ months ago.

### Pitfall 3: Shopify Orders Require `read_all_orders` Scope
**What goes wrong:** Standard `read_orders` scope only returns orders from the last 60 days. Historical backfill silently returns partial data.
**Why it happens:** Shopify requires explicit merchant consent for bulk order history access.
**How to avoid:** Request `read_all_orders` scope in the Shopify OAuth flow. This scope requires Shopify app review for public apps. For a custom/private app installation, it can be granted in the Partners dashboard.
**Warning signs:** Orders query returns results only within the last 60 days regardless of date filter.

### Pitfall 4: Shopify Expiring Offline Tokens (Dec 2025 Change)
**What goes wrong:** Shopify introduced expiring offline access tokens in December 2025. Access tokens now expire in 1 hour. Using the stored access token without refresh logic fails silently or throws 401 errors.
**Why it happens:** Prior to December 2025, offline tokens were permanent. New apps now receive expiring tokens by default.
**How to avoid:** Use `@shopify/shopify-api` which handles token refresh automatically. Store both access token AND refresh token. The refresh token has a 90-day lifetime — failed refresh means re-authorization required.
**Warning signs:** Shopify API calls begin returning 401 after ~1 hour without any code changes.

### Pitfall 5: Google Ads `login_customer_id` for Manager Accounts
**What goes wrong:** When a user connects a Google Ads manager account (MCC) and wants to pull data for a sub-account, API calls fail with `AuthorizationError.USER_PERMISSION_DENIED`.
**Why it happens:** Manager account access requires the `login_customer_id` header set to the MCC's customer ID, not the sub-account ID.
**How to avoid:** When a user connects Google Ads, use `customer.listAccessibleCustomers()` to enumerate accessible accounts. Store both `customerId` (the account to pull data from) and `loginCustomerId` (the manager account used to authenticate). Pass both to `client.Customer()`.
**Warning signs:** Consistent 401/403 errors for users who connected via MCC accounts.

### Pitfall 6: BullMQ Worker RLS Context Missing
**What goes wrong:** The ingestion worker makes database queries that return no rows (RLS blocks everything) or throws errors because `app.current_tenant_id` is not set.
**Why it happens:** BullMQ workers are not HTTP requests — they don't go through Next.js middleware that sets the session variable. Phase 1 RLS policies require `current_setting('app.current_tenant_id')`.
**How to avoid:** For the ingestion worker, use a dedicated Postgres connection that either (a) sets `SET LOCAL app.current_tenant_id = $tenantId` at the start of every transaction, or (b) connects as a superuser role that bypasses RLS, with explicit `WHERE tenant_id = $tenantId` in every query. Option (a) is more secure.
**Warning signs:** DB queries in the worker return empty results even when data visibly exists; or "unrecognized configuration parameter" errors in the worker logs.

### Pitfall 7: Meta Async Report Job Timeouts
**What goes wrong:** For large accounts (hundreds of campaigns, long date ranges), Meta's async insights API can take 5–30 minutes to complete. Polling too aggressively hits rate limits; polling too infrequently delays jobs.
**Why it happens:** Meta processes async jobs server-side; job completion time is proportional to data volume.
**How to avoid:** Use BullMQ delayed jobs for polling: after submitting an async job, enqueue a poll-check job with a 60-second delay. If not complete, re-enqueue another poll-check. Cap total polling attempts at 60 (1 hour max).
**Warning signs:** Sync jobs appearing stuck in "pending" state; Meta returning `async_percent_completion` values that don't reach 100%.

### Pitfall 8: Drizzle Upsert Target on Composite Unique Index
**What goes wrong:** `onConflictDoUpdate` with multiple target columns uses array syntax — using a single column (e.g., just `campaignId`) produces incorrect upsert behavior allowing duplicate rows.
**Why it happens:** `campaign_metrics` has a composite unique index on `(tenantId, campaignId, date, source)` — all four columns must be in the conflict target.
**How to avoid:** Always specify all four columns: `target: [campaignMetrics.tenantId, campaignMetrics.campaignId, campaignMetrics.date, campaignMetrics.source]`.
**Warning signs:** Duplicate metric rows for the same campaign/date; upserts silently inserting instead of updating.

---

## Code Examples

Verified patterns from official sources:

### Meta Ads — Initialize SDK and Fetch Campaign Insights
```typescript
// Source: facebook-nodejs-business-sdk GitHub README
import adsSdk from 'facebook-nodejs-business-sdk';
const { FacebookAdsApi, AdAccount, Campaign } = adsSdk;

// Initialize with a stored (decrypted) long-lived token
const api = FacebookAdsApi.init(decryptedAccessToken);
const account = new AdAccount(`act_${adAccountId}`);

// Get campaigns
const campaigns = await account.getCampaigns(
  [Campaign.Fields.id, Campaign.Fields.name, Campaign.Fields.status],
  { limit: 100 }
);

// Get insights (async for large ranges)
const adInsightsFields = ['spend', 'impressions', 'clicks', 'cpc', 'cpm', 'ctr'];
const params = {
  time_range: { since: '2023-01-01', until: '2025-12-31' },
  level: 'campaign',
  time_increment: 1,  // daily
  async: true,        // required for ranges > ~7 days at scale
};
const asyncJob = await account.getInsightsAsync(adInsightsFields, params);
// Then poll asyncJob.get(['async_percent_completion', 'async_status']) until complete
```

### Google Ads — Query Campaign Metrics with GAQL
```typescript
// Source: google-ads-api GitHub README (Opteo)
import { GoogleAdsApi } from 'google-ads-api';

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
});

const customer = client.Customer({
  customer_id: customerId,
  login_customer_id: loginCustomerId,  // MCC account ID (if applicable)
  refresh_token: decryptedRefreshToken,
});

const results = await customer.report({
  entity: 'campaign',
  attributes: ['campaign.id', 'campaign.name', 'campaign.status'],
  metrics: ['metrics.cost_micros', 'metrics.clicks', 'metrics.impressions'],
  segments: ['segments.date'],
  from_date: '2023-01-01',
  to_date: '2025-12-31',
});

// metrics.cost_micros is in micros — divide by 1,000,000 for USD
```

### Shopify — Offline Token OAuth Flow
```typescript
// Source: Shopify developer docs + @shopify/shopify-api
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: ['read_orders', 'read_all_orders'],
  hostName: process.env.HOST!,
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

// In your OAuth callback route:
// POST /api/auth/shopify/callback
const { session } = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
// session.accessToken is the offline access token (expires in 1hr from Dec 2025)
// session.refreshToken is the 90-day refresh token
// Encrypt and store both in the integrations table
```

### Shopify — Bulk Orders Query for Historical Backfill
```typescript
// Source: Shopify bulk operations docs
const client = new shopify.clients.Graphql({ session });

// Step 1: Submit bulk operation
const runQuery = `
  mutation {
    bulkOperationRunQuery(query: """
      { orders(query: "created_at:>='${startDate}' created_at:<='${endDate}'") {
          edges { node {
            id
            processedAt
            totalPriceSet { shopMoney { amount currencyCode } }
          }}
      }}
    """) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }
`;
const { body } = await client.request(runQuery);
const operationId = body.data.bulkOperationRunQuery.bulkOperation.id;

// Step 2: Poll until COMPLETED (use BullMQ delayed job pattern)
const pollQuery = `query { bulkOperation(id: "${operationId}") { status url objectCount } }`;
// (For API versions before 2026-01, use currentBulkOperation instead)

// Step 3: Stream-download JSONL from url
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
// Parse each line independently — do NOT JSON.parse the full file
```

### BullMQ — Nightly Sync Scheduler Setup
```typescript
// Source: BullMQ docs - https://docs.bullmq.io/guide/job-schedulers
import { Queue } from 'bullmq';

const queue = new Queue('ingestion', {
  connection: { host: process.env.REDIS_HOST, port: 6379 },
});

// Safe to call on every deploy — upsertJobScheduler is idempotent
export async function registerNightlySync(tenantId: string, platform: 'meta' | 'google_ads' | 'shopify') {
  await queue.upsertJobScheduler(
    `nightly-${platform}-${tenantId}`,
    { pattern: '0 2 * * *' },  // 2am UTC nightly
    {
      name: 'incremental-sync',
      data: { tenantId, platform, type: 'incremental' },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    }
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bull` npm package | `bullmq` | 2021 (BullMQ v1) | Bull is deprecated; BullMQ is TypeScript-native, maintained, better API |
| Bull `repeat` jobs | BullMQ `upsertJobScheduler` | BullMQ v5.16 (2024) | Old repeat API deprecated; Job Schedulers are more robust in distributed deployments |
| Shopify permanent offline tokens | Expiring offline tokens (1hr + 90-day refresh) | December 2025 | All new Shopify apps now get expiring tokens; requires refresh token storage and rotation |
| Shopify REST Admin API | Shopify GraphQL Admin API | Oct 2024 (REST deprecated) | REST marked legacy; all new public apps must use GraphQL API as of April 2025 |
| `facebook-nodejs-business-sdk` v20/v21 | v23 | Oct 2024 (v23 released 2025) | SDK tracks API versioning; v22+ required for latest attribution unified settings |
| Google Ads API v16-v18 | v23 | Feb 2026 (v23 current) | v23 adds additional metrics; older versions sunset on rolling 12-month schedule |
| Meta 28-day view-through attribution | 7-day click (default unified) | January 12, 2026 | 7d_view and 28d_view attribution windows removed from Insights API |
| Meta 37-month aggregate lookback | 13-month limit for unique/breakdown metrics | January 12, 2026 | Aggregate totals still 37 months; breakdown metrics capped at 13 months |

**Deprecated/outdated:**
- `bull` npm package: Replaced by `bullmq`. Do not install `bull`.
- Shopify REST Admin API: Officially deprecated October 2024. Use GraphQL Admin API for all new development.
- Meta `7d_view` and `28d_view` attribution parameters: Removed January 12, 2026. Using them returns errors.
- Google Ads API versions v16 and earlier: Sunset on rolling 12-month schedule. Use v23.

---

## Required Schema Additions

Phase 1 schema needs two new tables for this phase. These require a new Drizzle migration:

### `integrations` table
Stores OAuth credentials per tenant per platform. Not in Phase 1 schema — must be added.

```typescript
export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  platform: text('platform').notNull(),          // 'meta' | 'google_ads' | 'shopify'
  status: text('status').notNull(),              // 'connected' | 'error' | 'expired'
  accountId: text('account_id'),                 // platform's account/store identifier
  accountName: text('account_name'),             // display name for UI
  // All token fields stored AES-256-GCM encrypted
  encryptedAccessToken: text('encrypted_access_token'),
  encryptedRefreshToken: text('encrypted_refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  // Platform-specific metadata
  metadata: jsonb('metadata'),                   // e.g., { loginCustomerId, adAccountId }
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncStatus: text('last_sync_status'),      // 'success' | 'partial' | 'failed'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
```

### `sync_runs` table
Provides the sync history log (last 5-7 syncs per integration for diagnostics).

```typescript
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  integrationId: uuid('integration_id').notNull().references(() => integrations.id),
  platform: text('platform').notNull(),
  runType: text('run_type').notNull(),           // 'incremental' | 'backfill' | 'manual'
  status: text('status').notNull(),              // 'running' | 'success' | 'partial' | 'failed'
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  recordsIngested: numeric('records_ingested', { precision: 12, scale: 0 }),
  errorMessage: text('error_message'),
  // Backfill progress: { completed: 14, total: 36, unit: 'months' }
  progressMetadata: jsonb('progress_metadata'),
}, (t) => [
  pgPolicy('tenant_isolation', {
    as: 'restrictive',
    for: 'all',
    to: appRole,
    using: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
    withCheck: sql`tenant_id = current_setting('app.current_tenant_id')::uuid`,
  }),
]);
```

**Migration:** A new Drizzle migration (`packages/db`) must add these two tables before any ingestion code can run.

---

## Open Questions

1. **Does Phase 2 scaffold `apps/web` (Next.js)?**
   - What we know: OAuth callbacks require an HTTP endpoint. BullMQ workers cannot handle OAuth redirects.
   - What's unclear: Whether to build a minimal Express/Hono server (simpler) or scaffold the full Next.js app that Phase 4 will need.
   - Recommendation: Scaffold `apps/web` as a minimal Next.js App Router app with just the OAuth callback routes. Phase 4 expands it. Avoids building throw-away infrastructure.

2. **Meta `read_all_orders` analog for 3-year backfill — what fields are available?**
   - What we know: Meta aggregate totals (spend, impressions, clicks) support 37-month lookback. Unique/breakdown metrics capped at 13 months.
   - What's unclear: Whether `actions` (total conversions, not unique) are also available for 37 months.
   - Recommendation: For Phase 2, only backfill spend/impressions/clicks (aggregate, no breakdowns). Phase 3 can request additional fields if needed.

3. **Google Ads: Does `google-ads-api` v23 (Opteo) require `basic_access` developer token or does `test_account` level work?**
   - What we know: Explorer access limited to 2,880 operations/day. Standard access is unlimited. Test accounts have separate (higher) limits.
   - What's unclear: Whether Opteo's library requires any specific access level setup beyond OAuth credentials.
   - Recommendation: Proceed with the assumption that standard access developer token is required for production. For development, test account access is sufficient.

4. **Where does the BullMQ worker process run?**
   - What we know: BullMQ workers are separate Node.js processes from the Next.js web server.
   - What's unclear: How to run the worker on Railway (the planned hosting platform per STATE.md). Railway supports multiple services per project.
   - Recommendation: Create a separate `packages/worker` (or `apps/worker`) that imports from `packages/ingestion` and runs the BullMQ worker. Deploy as a separate Railway service.

5. **Shopify: Does `read_all_orders` require formal Shopify app review?**
   - What we know: For public Shopify apps listed in the App Store, `read_all_orders` requires explicit review. For custom/private apps, it can be granted in the Partners dashboard.
   - What's unclear: Whether Incremental IQ will use a custom app installation (likely) or a public app install flow.
   - Recommendation: For v1, use a custom app installation model — merchants install via a direct OAuth link, not the Shopify App Store. This avoids app review and allows `read_all_orders` without approval.

---

## Sources

### Primary (HIGH confidence)
- [BullMQ docs - Job Schedulers](https://docs.bullmq.io/guide/job-schedulers) - upsertJobScheduler API verified
- [Google Ads API Quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas) - daily operation limits verified
- [google-ads-api README (Opteo)](https://github.com/Opteo/google-ads-api/blob/master/README.md) - TypeScript client patterns verified
- [Shopify Bulk Operations](https://shopify.dev/docs/api/usage/bulk-operations/queries) - bulk query flow verified
- [Shopify Offline Access Tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens) - expiring token changes verified
- [Shopify Orders Query](https://shopify.dev/docs/api/admin-graphql/latest/queries/orders) - field structure verified
- [Shopify REST rate limits](https://shopify.dev/docs/api/admin-rest/usage/rate-limits) - leaky bucket limits verified

### Secondary (MEDIUM confidence)
- [Meta Marketing API attribution restrictions Jan 2026](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/) - attribution window removal and 13-month limit verified against multiple sources
- [google-ads-api npm package](https://www.npmjs.com/package/google-ads-api) - v23.0.0 current version verified
- [facebook-nodejs-business-sdk GitHub](https://github.com/facebook/facebook-nodejs-business-sdk) - v23 current, official Meta-maintained
- Meta rate limiting (score-based, 1hr rolling window) - verified across multiple sources but specific score values not confirmed from official docs

### Tertiary (LOW confidence)
- Specific Meta async report polling frequency recommendations (30-60 second intervals) — from community sources, not official docs
- Exact Shopify `read_all_orders` review requirement for custom vs public apps — from community forums, not official policy docs
- Google Ads v23 release as "first release of 2026" — from roundup article, not official changelog

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all library choices verified against npm, GitHub, or official docs
- Architecture: MEDIUM-HIGH — patterns from official docs; some integration-specific behavior (Meta async timing) from community sources
- Pitfalls: HIGH — Shopify expiring tokens and Meta Jan 2026 restrictions verified from official/authoritative sources; RLS worker pitfall is from Phase 1 architecture knowledge

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days; Meta API version cadence and Shopify token model are changing actively — re-verify before implementing)
