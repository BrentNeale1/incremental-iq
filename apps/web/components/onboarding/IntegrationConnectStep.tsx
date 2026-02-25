'use client';

import * as React from 'react';
import { useTenantId } from '@/lib/auth/tenant-context';
import { IntegrationCard, IntegrationStatus } from '@/components/onboarding/IntegrationCard';
import { AlertCircle } from 'lucide-react';

interface ConnectedIntegration {
  integrationId: string;
}

interface Props {
  connectedIntegrations: Record<string, ConnectedIntegration>;
  onIntegrationConnected: (platform: string, integrationId: string) => void;
}

// Platform icon components (simple SVG text representations)
function MetaIcon() {
  return (
    <span className="text-[#1877F2] font-bold text-sm">f</span>
  );
}
function GoogleIcon() {
  return (
    <span className="text-[#4285F4] font-bold text-sm">G</span>
  );
}
function ShopifyIcon() {
  return (
    <span className="text-[#96BF48] font-bold text-sm">S</span>
  );
}
function GA4Icon() {
  return (
    <span className="text-[#E37400] font-bold text-sm">GA</span>
  );
}

const COMMERCE_SOURCES = [
  {
    platform: 'shopify',
    name: 'Shopify',
    description: 'Connect your Shopify store to import revenue and order data.',
    icon: <ShopifyIcon />,
    category: 'commerce' as const,
  },
  {
    platform: 'ga4',
    name: 'Google Analytics 4',
    description: 'Connect GA4 to track lead events and conversion data.',
    icon: <GA4Icon />,
    category: 'commerce' as const,
  },
];

const PAID_CHANNELS = [
  {
    platform: 'meta',
    name: 'Meta Ads',
    description: 'Import Facebook and Instagram campaign spend and performance data.',
    icon: <MetaIcon />,
    category: 'paid_channel' as const,
  },
  {
    platform: 'google',
    name: 'Google Ads',
    description: 'Import Google Ads campaign spend and performance data.',
    icon: <GoogleIcon />,
    category: 'paid_channel' as const,
  },
];

/**
 * IntegrationConnectStep — Step 1 of the onboarding wizard.
 *
 * Shows integration cards grouped into two categories:
 *   - Commerce/Analytics sources (Shopify, GA4)
 *   - Paid channels (Meta Ads, Google Ads)
 *
 * OAuth popup pattern (RESEARCH.md Pitfall 8):
 *   window.open() is called SYNCHRONOUSLY in the click handler,
 *   BEFORE any async work, to avoid popup blocker.
 *
 * canProceed: at least one commerce/analytics source AND one paid channel connected.
 */
export function IntegrationConnectStep({ connectedIntegrations, onIntegrationConnected }: Props) {
  const tenantId = useTenantId();
  const [statuses, setStatuses] = React.useState<Record<string, IntegrationStatus>>({});
  const [errorMessages, setErrorMessages] = React.useState<Record<string, string>>({});

  const getStatus = (platform: string): IntegrationStatus => {
    if (connectedIntegrations[platform]) return 'connected';
    return statuses[platform] ?? 'disconnected';
  };

  const handleConnect = (platform: string, shopDomain?: string) => {
    // CRITICAL: window.open() MUST be synchronous — called before any async work
    // to avoid popup blockers (RESEARCH.md Pitfall 8).
    let oauthUrl = `/api/oauth/${platform}?tenantId=${tenantId}`;
    if (platform === 'shopify' && shopDomain) {
      oauthUrl += `&shop=${encodeURIComponent(shopDomain)}`;
    }

    const popup = window.open(oauthUrl, 'oauth', 'width=600,height=700,scrollbars=yes');

    if (!popup) {
      setStatuses((prev) => ({ ...prev, [platform]: 'error' }));
      setErrorMessages((prev) => ({
        ...prev,
        [platform]: 'Popup was blocked. Please allow popups for this site.',
      }));
      return;
    }

    setStatuses((prev) => ({ ...prev, [platform]: 'connecting' }));

    // Listen for postMessage from OAuth callback HTML
    const messageHandler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth_complete') return;
      if (event.data?.platform !== platform) return;

      window.removeEventListener('message', messageHandler);
      clearInterval(pollInterval);

      if (event.data.success) {
        setStatuses((prev) => {
          const next = { ...prev };
          delete next[platform];
          return next;
        });
        onIntegrationConnected(platform, event.data.integrationId);
      } else {
        setStatuses((prev) => ({ ...prev, [platform]: 'error' }));
        setErrorMessages((prev) => ({
          ...prev,
          [platform]: event.data.error ?? 'Connection failed. Please try again.',
        }));
      }
    };

    window.addEventListener('message', messageHandler);

    // Poll for popup closed without completing OAuth
    const pollInterval = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollInterval);
        window.removeEventListener('message', messageHandler);
        // Only set error if still in 'connecting' state (not already connected via message)
        setStatuses((prev) => {
          if (prev[platform] === 'connecting') {
            return { ...prev, [platform]: 'error' };
          }
          return prev;
        });
        setErrorMessages((prev) => ({
          ...prev,
          [platform]: (prev[platform] !== undefined)
            ? prev[platform]
            : 'Window closed before connecting. Please try again.',
        }));
      }
    }, 500);
  };

  // Compute canProceed
  const connectedPlatforms = new Set([
    ...Object.keys(connectedIntegrations),
  ]);
  const hasCommerceSource = COMMERCE_SOURCES.some((s) => connectedPlatforms.has(s.platform));
  const hasPaidChannel = PAID_CHANNELS.some((s) => connectedPlatforms.has(s.platform));
  const canProceed = hasCommerceSource && hasPaidChannel;

  return (
    <div className="space-y-6">
      {/* Commerce / Analytics sources */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Commerce &amp; Analytics Sources
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {COMMERCE_SOURCES.map((src) => (
            <IntegrationCard
              key={src.platform}
              platform={src.platform}
              name={src.name}
              description={src.description}
              icon={src.icon}
              category={src.category}
              status={getStatus(src.platform)}
              onConnect={() => handleConnect(src.platform)}
              onConnectWithShop={
                src.platform === 'shopify'
                  ? (shop) => handleConnect(src.platform, shop)
                  : undefined
              }
              errorMessage={errorMessages[src.platform]}
            />
          ))}
        </div>
      </section>

      {/* Paid channels */}
      <section>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Paid Channels
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAID_CHANNELS.map((ch) => (
            <IntegrationCard
              key={ch.platform}
              platform={ch.platform}
              name={ch.name}
              description={ch.description}
              icon={ch.icon}
              category={ch.category}
              status={getStatus(ch.platform)}
              onConnect={() => handleConnect(ch.platform)}
              errorMessage={errorMessages[ch.platform]}
            />
          ))}
        </div>
      </section>

      {/* Validation message */}
      {!canProceed && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            Connect at least one commerce/analytics source and one paid channel to continue.
          </span>
        </div>
      )}
    </div>
  );
}
