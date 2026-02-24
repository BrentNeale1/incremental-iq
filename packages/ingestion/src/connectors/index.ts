import type { Platform } from '../types';
import type { PlatformConnector } from '../connector-base';
import { GoogleAdsConnector } from './google-ads';
import { MetaConnector } from './meta';
import { ShopifyConnector } from './shopify';

/**
 * Connector registry mapping platform identifiers to connector instances.
 *
 * All three platform connectors are registered:
 *   - meta:       Meta Ads API (facebook-nodejs-business-sdk) — Plan 03
 *   - google_ads: Google Ads API (google-ads-api / Opteo) — Plan 04
 *   - shopify:    Shopify GraphQL Admin API (@shopify/shopify-api) — Plan 05
 *
 * The registry is lazy — connectors are instantiated on first request
 * and reused for subsequent calls (stateless by design).
 */
const connectorInstances: Partial<Record<Platform, PlatformConnector>> = {};

/**
 * Returns the PlatformConnector for the given platform.
 *
 * Connectors are singletons within a process — they hold no per-request state.
 * All request-specific data (credentials, tenant context) is passed through
 * the ConnectorConfig argument to each connector method.
 *
 * @throws If no connector is registered for the given platform
 */
export function getConnector(platform: Platform): PlatformConnector {
  if (!connectorInstances[platform]) {
    connectorInstances[platform] = createConnector(platform);
  }
  return connectorInstances[platform]!;
}

function createConnector(platform: Platform): PlatformConnector {
  switch (platform) {
    case 'meta':
      return new MetaConnector();
    case 'google_ads':
      return new GoogleAdsConnector();
    case 'shopify':
      return new ShopifyConnector();
    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unknown platform: ${_exhaustive}`);
    }
  }
}

export { MetaConnector } from './meta';
export { GoogleAdsConnector } from './google-ads';
export { ShopifyConnector } from './shopify';
