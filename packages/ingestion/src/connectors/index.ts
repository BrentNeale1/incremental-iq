import type { Platform } from '../types';
import type { PlatformConnector } from '../connector-base';
import { GoogleAdsConnector } from './google-ads';
import { MetaConnector } from './meta';
import { ShopifyConnector } from './shopify';
import { GA4Connector } from './ga4';

/**
 * Connector registry mapping platform identifiers to connector instances.
 *
 * Ad platform connectors (PlatformConnector interface):
 *   - meta:       Meta Ads API (facebook-nodejs-business-sdk) — Plan 03
 *   - google_ads: Google Ads API (google-ads-api / Opteo) — Plan 04
 *   - shopify:    Shopify GraphQL Admin API (@shopify/shopify-api) — Plan 05
 *
 * Outcome source connectors (separate interface):
 *   - ga4:        Google Analytics 4 (outcome source, not ad platform) — Plan 05-02
 *                 Use getGA4Connector() to access the GA4-specific API.
 *
 * The registry is lazy — connectors are instantiated on first request
 * and reused for subsequent calls (stateless by design).
 */
type AdPlatform = Exclude<Platform, 'ga4'>;
const connectorInstances: Partial<Record<AdPlatform, PlatformConnector>> = {};
let ga4ConnectorInstance: GA4Connector | undefined;

/**
 * Returns the PlatformConnector for the given ad platform.
 *
 * Connectors are singletons within a process — they hold no per-request state.
 * All request-specific data (credentials, tenant context) is passed through
 * the ConnectorConfig argument to each connector method.
 *
 * For GA4, use getGA4Connector() instead — GA4 is an outcome source with
 * a different API surface (listProperties, listKeyEvents, fetchLeadCounts).
 *
 * @throws If no connector is registered for the given platform
 */
export function getConnector(platform: AdPlatform): PlatformConnector {
  if (!connectorInstances[platform]) {
    connectorInstances[platform] = createConnector(platform);
  }
  return connectorInstances[platform]!;
}

/**
 * Returns the GA4Connector singleton instance.
 *
 * GA4 is an outcome source (lead counts), not an ad platform.
 * It has a different method surface from PlatformConnector.
 */
export function getGA4Connector(): GA4Connector {
  if (!ga4ConnectorInstance) {
    ga4ConnectorInstance = new GA4Connector();
  }
  return ga4ConnectorInstance;
}

function createConnector(platform: AdPlatform): PlatformConnector {
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
export { GA4Connector } from './ga4';
