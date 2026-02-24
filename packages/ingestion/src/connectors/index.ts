import type { Platform } from '../types';
import type { PlatformConnector } from '../connector-base';
import { GoogleAdsConnector } from './google-ads';

/**
 * Connector registry mapping platform identifiers to connector instances.
 *
 * Plans 03 (Meta) and 05 (Shopify) will register their connectors here.
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
    case 'google_ads':
      return new GoogleAdsConnector();
    case 'meta':
      // Registered in Plan 03 (meta.ts)
      throw new Error(
        `Connector for platform 'meta' is not yet registered. Implement packages/ingestion/src/connectors/meta.ts (Plan 03).`,
      );
    case 'shopify':
      // Registered in Plan 05 (shopify.ts)
      throw new Error(
        `Connector for platform 'shopify' is not yet registered. Implement packages/ingestion/src/connectors/shopify.ts (Plan 05).`,
      );
    default: {
      const _exhaustive: never = platform;
      throw new Error(`Unknown platform: ${_exhaustive}`);
    }
  }
}
