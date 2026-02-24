import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION, Session } from '@shopify/shopify-api';
import { createInterface } from 'readline';
import * as https from 'https';
import * as http from 'http';
import pRetry, { AbortError } from 'p-retry';
import type { PlatformConnector, RawCampaignData, RawMetricData } from '../connector-base';
import type { ConnectorConfig, DecryptedCredentials } from '../types';

/**
 * Raw order shape returned by Shopify GraphQL Admin API.
 * Typed narrowly for the fields we request.
 */
interface ShopifyOrder {
  id: string;
  processedAt: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  subtotalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  totalDiscountsSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

/**
 * Raw metric data shape for Shopify orders (extends RawMetricData for the normalizer).
 */
export interface ShopifyRawMetricData extends RawMetricData {
  processedAt: string;
  totalPriceAmount: string;
  currencyCode: string;
  subtotalPriceAmount: string;
  totalDiscountsAmount: string;
}

/**
 * Shopify GraphQL response data for the orders query.
 * Used as the type parameter to GraphqlClient.query() for the response body.
 */
interface OrdersQueryData {
  orders: {
    edges: Array<{
      node: ShopifyOrder;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

/**
 * Shopify bulk operation response data.
 */
interface BulkRunMutationData {
  bulkOperationRunQuery: {
    bulkOperation: { id: string; status: string } | null;
    userErrors: Array<{ field: string; message: string }>;
  };
}

/**
 * Poll response data for a bulk operation node query.
 */
interface BulkOperationNodeData {
  node: {
    id: string;
    status: 'CREATED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'CANCELING' | 'EXPIRED';
    url: string | null;
    objectCount: string;
    errorCode: string | null;
  } | null;
}

/** GraphQL client instance type (inferred from shopify.clients.Graphql) */
type GraphqlClientInstance = InstanceType<ReturnType<typeof shopifyApi>['clients']['Graphql']>;

/**
 * Shopify connector implementing PlatformConnector.
 *
 * Supports two sync paths:
 *   - Incremental (≤30 days): Standard GraphQL orders query with cursor pagination
 *   - Backfill (>30 days): Bulk Operations API with JSONL streaming to avoid OOM
 *
 * Token refresh (Pitfall 4 from RESEARCH.md):
 *   - Shopify introduced 1-hour expiring offline tokens in December 2025
 *   - Access tokens expire in 1 hour; refresh tokens expire after 90 days
 *   - refreshTokenIfNeeded handles both: refresh if possible, signal re-auth if not
 */
export class ShopifyConnector implements PlatformConnector {
  private shopify: ReturnType<typeof shopifyApi>;

  constructor() {
    this.shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY ?? '',
      apiSecretKey: process.env.SHOPIFY_API_SECRET ?? '',
      // Pitfall 3: read_all_orders required for historical backfill beyond 60 days
      scopes: ['read_orders', 'read_all_orders'],
      hostName: process.env.NEXT_PUBLIC_APP_URL?.replace(/^https?:\/\//, '') ?? 'localhost',
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: false,
    });
  }

  /**
   * Builds a Shopify Session object from connector credentials.
   * Session is required by the GraphQL client constructor.
   */
  private buildSession(shop: string, accessToken: string): Session {
    const session = new Session({
      id: `offline_${shop}`,
      shop,
      state: '',
      isOnline: false,
    });
    session.accessToken = accessToken;
    session.scope = 'read_orders,read_all_orders';
    return session;
  }

  /**
   * Shopify has no campaign concept — returns empty array.
   *
   * Revenue attribution to campaigns requires UTM tracking (Phase 3/4).
   * For Phase 2, Shopify data flows into campaign_metrics as daily revenue
   * totals per store under a synthetic "shopify-revenue" campaign.
   */
  async fetchCampaigns(_config: ConnectorConfig): Promise<RawCampaignData[]> {
    return [];
  }

  /**
   * Incremental sync path: standard GraphQL orders query with cursor pagination.
   *
   * Used for date ranges ≤30 days. Fetches orders with created_at filter,
   * paginates through all pages, wraps in p-retry for transient failures.
   *
   * @param config - Connector config with decrypted Shopify credentials
   * @param dateRange - Start and end dates (ISO format: 'YYYY-MM-DD')
   * @returns Array of raw order data ready for the normalizer
   */
  async fetchMetrics(
    config: ConnectorConfig,
    dateRange: { start: string; end: string }
  ): Promise<ShopifyRawMetricData[]> {
    const { credentials } = config;
    const shop = (credentials.metadata?.shop as string) ?? '';
    const session = this.buildSession(shop, credentials.accessToken);
    const client = new this.shopify.clients.Graphql({ session });

    const allOrders: ShopifyRawMetricData[] = [];
    let hasNextPage = true;
    let afterCursor: string | null = null;

    while (hasNextPage) {
      const cursorClause: string = afterCursor ? `, after: "${afterCursor}"` : '';
      const queryStr: string = `
        {
          orders(first: 250, query: "created_at:>='${dateRange.start}' created_at:<='${dateRange.end}'"${cursorClause}) {
            edges {
              node {
                id
                processedAt
                totalPriceSet { shopMoney { amount currencyCode } }
                subtotalPriceSet { shopMoney { amount currencyCode } }
                totalDiscountsSet { shopMoney { amount currencyCode } }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;

      const response: OrdersQueryData = await pRetry(
        async (): Promise<OrdersQueryData> => {
          const result = await client.query<OrdersQueryData>({ data: queryStr });
          if (!result.body?.orders) {
            throw new Error('Shopify orders query returned no data');
          }
          return result.body;
        },
        {
          retries: 5,
          factor: 2,
          minTimeout: 5_000,
          maxTimeout: 120_000,
          randomize: true,
        }
      );

      const { edges, pageInfo } = response.orders;

      for (const { node } of edges) {
        // Extract date from processedAt (ISO timestamp → YYYY-MM-DD)
        const date = node.processedAt.slice(0, 10);

        allOrders.push({
          date,
          campaignId: 'shopify-revenue', // synthetic; normalizer replaces with real UUID
          processedAt: node.processedAt,
          totalPriceAmount: node.totalPriceSet.shopMoney.amount,
          currencyCode: node.totalPriceSet.shopMoney.currencyCode,
          subtotalPriceAmount: node.subtotalPriceSet.shopMoney.amount,
          totalDiscountsAmount: node.totalDiscountsSet.shopMoney.amount,
        });
      }

      hasNextPage = pageInfo.hasNextPage;
      afterCursor = pageInfo.endCursor;
    }

    return allOrders;
  }

  /**
   * Backfill path: Shopify Bulk Operations API with JSONL streaming.
   *
   * Used for date ranges >30 days to bypass standard GraphQL rate limits
   * (leaky bucket: 40 req/store on standard plans).
   *
   * Bulk operations are designed for exactly this use case and bypass the
   * normal rate limits. The JSONL file is streamed line-by-line to avoid OOM
   * on large datasets (RESEARCH.md Pattern 6 / Anti-Pattern: never JSON.parse the full file).
   *
   * @param config - Connector config with decrypted Shopify credentials
   * @param dateRange - Start and end dates (ISO format: 'YYYY-MM-DD')
   * @returns Array of raw order data (parsed from JSONL stream)
   */
  async fetchMetricsBulk(
    config: ConnectorConfig,
    dateRange: { start: string; end: string }
  ): Promise<ShopifyRawMetricData[]> {
    const { credentials } = config;
    const shop = (credentials.metadata?.shop as string) ?? '';
    const session = this.buildSession(shop, credentials.accessToken);
    const client = new this.shopify.clients.Graphql({ session });

    // Step 1: Submit bulk operation mutation
    const runMutation = `
      mutation {
        bulkOperationRunQuery(query: """
          {
            orders(query: "created_at:>='${dateRange.start}' created_at:<='${dateRange.end}'") {
              edges {
                node {
                  id
                  processedAt
                  totalPriceSet { shopMoney { amount currencyCode } }
                  subtotalPriceSet { shopMoney { amount currencyCode } }
                  totalDiscountsSet { shopMoney { amount currencyCode } }
                }
              }
            }
          }
        """) {
          bulkOperation {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const runResponse = await client.query<BulkRunMutationData>({ data: runMutation });
    const bulkOpResult = runResponse.body?.bulkOperationRunQuery;

    if (!bulkOpResult) {
      throw new Error('Shopify bulk operation mutation returned no data');
    }
    if (bulkOpResult.userErrors?.length > 0) {
      throw new Error(
        `Shopify bulk operation failed: ${bulkOpResult.userErrors.map((e) => e.message).join(', ')}`
      );
    }
    if (!bulkOpResult.bulkOperation?.id) {
      throw new Error('Shopify bulk operation did not return an operation ID');
    }

    const operationId = bulkOpResult.bulkOperation.id;

    // Step 2: Poll for completion (every 30s, max 60 minutes)
    const completedOp = await this._pollBulkOperation(client, operationId);

    if (!completedOp.url) {
      // COMPLETED but no URL means zero matching orders
      return [];
    }

    // Step 3: Stream-parse the JSONL file line-by-line to avoid OOM
    return this._streamJsonlOrders(completedOp.url);
  }

  /**
   * Polls a Shopify bulk operation until it reaches a terminal state.
   *
   * Uses 30-second poll intervals (suitable for small-to-medium stores).
   * Maximum poll duration: 60 minutes (120 polls × 30s).
   *
   * @param client - Shopify GraphQL client instance
   * @param operationId - Bulk operation GID to poll
   * @returns Completed operation node (includes download URL)
   */
  private async _pollBulkOperation(
    client: GraphqlClientInstance,
    operationId: string
  ): Promise<NonNullable<BulkOperationNodeData['node']>> {
    const pollQuery = `
      query {
        node(id: "${operationId}") {
          ... on BulkOperation {
            id
            status
            url
            objectCount
            errorCode
          }
        }
      }
    `;

    const MAX_POLLS = 120; // 120 × 30s = 60 minutes max
    const POLL_INTERVAL_MS = 30_000;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await client.query<BulkOperationNodeData>({ data: pollQuery });
      const op = response.body?.node;

      if (!op) {
        throw new Error(`Bulk operation ${operationId} not found during polling`);
      }

      if (op.status === 'COMPLETED') {
        return op;
      }

      if (op.status === 'FAILED' || op.status === 'CANCELED' || op.status === 'EXPIRED') {
        throw new Error(
          `Shopify bulk operation ${operationId} ended with status ${op.status}${op.errorCode ? ` (${op.errorCode})` : ''}`
        );
      }

      // CREATED, RUNNING, CANCELING — continue polling
    }

    throw new Error(
      `Shopify bulk operation ${operationId} did not complete within 60 minutes (${MAX_POLLS} polls)`
    );
  }

  /**
   * Streams a Shopify bulk operation JSONL file line-by-line.
   *
   * Critically: does NOT JSON.parse the full file — each line is parsed
   * independently. Shopify bulk operation JSONL files can be gigabytes for
   * large stores; loading the full file into memory would cause OOM.
   * (RESEARCH.md Anti-Pattern: never JSON.parse the full JSONL file)
   *
   * @param url - Authenticated JSONL download URL from bulk operation
   * @returns Array of normalized order data parsed from the JSONL
   */
  private async _streamJsonlOrders(url: string): Promise<ShopifyRawMetricData[]> {
    const orders: ShopifyRawMetricData[] = [];

    await new Promise<void>((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;

      protocol.get(url, (response) => {
        const rl = createInterface({
          input: response,
          crlfDelay: Infinity,
        });

        rl.on('line', (line: string) => {
          if (!line.trim()) return;

          let node: ShopifyOrder;
          try {
            node = JSON.parse(line) as ShopifyOrder;
          } catch {
            // Malformed lines in bulk JSONL are skipped with a warning
            console.warn('[ShopifyConnector] Skipping malformed JSONL line:', line.slice(0, 100));
            return;
          }

          if (!node.id || !node.processedAt || !node.totalPriceSet) {
            // Parent-type records in JSONL (not leaf order nodes) — skip
            return;
          }

          const date = node.processedAt.slice(0, 10);
          orders.push({
            date,
            campaignId: 'shopify-revenue',
            processedAt: node.processedAt,
            totalPriceAmount: node.totalPriceSet.shopMoney.amount,
            currencyCode: node.totalPriceSet.shopMoney.currencyCode,
            subtotalPriceAmount: node.subtotalPriceSet?.shopMoney?.amount ?? '0',
            totalDiscountsAmount: node.totalDiscountsSet?.shopMoney?.amount ?? '0',
          });
        });

        rl.on('close', resolve);
        rl.on('error', reject);
        response.on('error', reject);
      }).on('error', reject);
    });

    return orders;
  }

  /**
   * Refreshes the Shopify access token if it is expired or near expiry.
   *
   * Since December 2025, Shopify offline access tokens expire after 1 hour
   * (RESEARCH.md Pitfall 4). The refresh token (90-day lifetime) is used
   * to obtain a new access token. If the refresh token is also expired
   * (>90 days old), throws an AbortError to signal re-authorization is required.
   *
   * @param config - Current connector config (credentials may be expired)
   * @returns Fresh DecryptedCredentials with new access token and expiry
   * @throws AbortError If the refresh token is expired — caller must set integration status to 'expired'
   */
  async refreshTokenIfNeeded(config: ConnectorConfig): Promise<DecryptedCredentials> {
    const { credentials } = config;
    const shop = (credentials.metadata?.shop as string) ?? '';

    // Check if access token has expired (tokenExpiresAt stored as epoch ms in metadata)
    const tokenExpiresAt = credentials.metadata?.tokenExpiresAt as number | undefined;
    const now = Date.now();

    // Refresh if within 5 minutes of expiry (or already expired)
    const REFRESH_BUFFER_MS = 5 * 60 * 1000;
    const needsRefresh = tokenExpiresAt !== undefined && now >= tokenExpiresAt - REFRESH_BUFFER_MS;

    if (!needsRefresh) {
      return credentials;
    }

    const refreshToken = credentials.refreshToken;
    if (!refreshToken) {
      throw new Error(
        `Shopify integration for shop ${shop} requires re-authorization: no refresh token stored`
      );
    }

    // Exchange refresh token for a new access token via Shopify's token refresh endpoint
    const tokenEndpoint = `https://${shop}/admin/oauth/access_token`;

    const requestBody = JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY ?? '',
      client_secret: process.env.SHOPIFY_API_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const refreshResponse = await pRetry(
      async () => {
        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
        });

        if (response.status === 401 || response.status === 400) {
          // Refresh token expired or invalid — do not retry, re-auth required
          const text = await response.text();
          // AbortError from p-retry prevents further retries
          throw new AbortError(
            `Shopify refresh token expired for shop ${shop}: ${text}`
          );
        }

        if (!response.ok) {
          throw new Error(
            `Shopify token refresh failed for shop ${shop}: HTTP ${response.status}`
          );
        }

        return response.json() as Promise<{
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
        }>;
      },
      {
        retries: 3,
        factor: 2,
        minTimeout: 2_000,
        maxTimeout: 30_000,
        randomize: true,
      }
    );

    const newExpiresAt = refreshResponse.expires_in
      ? Date.now() + refreshResponse.expires_in * 1000
      : Date.now() + 3600 * 1000; // Default: 1-hour expiry

    return {
      accessToken: refreshResponse.access_token,
      refreshToken: refreshResponse.refresh_token ?? refreshToken,
      metadata: {
        ...(credentials.metadata ?? {}),
        shop,
        tokenExpiresAt: newExpiresAt,
      },
    };
  }
}
