'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type IntegrationStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface Props {
  platform: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'commerce' | 'paid_channel';
  status: IntegrationStatus;
  onConnect: () => void;
  onConnectWithShop?: (shop: string) => void;
  errorMessage?: string;
}

/**
 * IntegrationCard — individual platform integration card in Step 1.
 *
 * Visual states:
 *   - disconnected: Connect button (or shop domain input for Shopify)
 *   - connecting: Spinner, button disabled
 *   - connected: Green check badge, no button
 *   - error: Red error message + Retry button
 *
 * Shopify special case: shows a shop domain input field before the
 * Connect button when platform === 'shopify' and status === 'disconnected'.
 */
export function IntegrationCard({
  platform,
  name,
  description,
  icon,
  status,
  onConnect,
  onConnectWithShop,
  errorMessage,
}: Props) {
  const [shopDomain, setShopDomain] = React.useState('');

  const isShopify = platform === 'shopify';

  const handleShopifyConnect = () => {
    if (onConnectWithShop) {
      onConnectWithShop(shopDomain.trim());
    } else {
      onConnect();
    }
  };

  return (
    <Card
      className={cn(
        'transition-colors',
        status === 'connected' && 'border-green-500/50 bg-green-50/30 dark:bg-green-950/10',
        status === 'error' && 'border-destructive/50',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Platform icon */}
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>

          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{name}</span>
              {status === 'connected' && (
                <Badge
                  variant="outline"
                  className="text-green-600 border-green-500 text-xs py-0 h-5"
                >
                  <Check className="w-3 h-3 mr-1" />
                  Connected
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>

            {/* Error message */}
            {status === 'error' && errorMessage && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Shopify shop domain input */}
            {isShopify && status === 'disconnected' && (
              <div className="mt-2">
                <Input
                  type="text"
                  placeholder="mystore.myshopify.com"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  className="h-8 text-xs"
                  aria-label="Shopify store domain"
                />
              </div>
            )}

            {/* Action button */}
            <div className="mt-3">
              {status === 'disconnected' && !isShopify && (
                <Button size="sm" onClick={onConnect} className="h-8 text-xs">
                  Connect
                </Button>
              )}
              {status === 'disconnected' && isShopify && (
                <Button
                  size="sm"
                  onClick={handleShopifyConnect}
                  disabled={!shopDomain.trim()}
                  className="h-8 text-xs"
                >
                  Connect
                </Button>
              )}
              {status === 'connecting' && (
                <Button size="sm" disabled className="h-8 text-xs">
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                  Connecting...
                </Button>
              )}
              {status === 'error' && (
                <Button size="sm" variant="outline" onClick={onConnect} className="h-8 text-xs">
                  Retry
                </Button>
              )}
              {/* Connected: no button shown */}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
