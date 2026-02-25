'use client';

import { useDashboardStore } from '@/lib/store/dashboard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Country code to flag emoji (regional indicator symbols). */
function countryFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

/**
 * Global market filter dropdown for the AppHeader.
 *
 * - Reads markets from Zustand dashboard store (populated by useMarkets hook)
 * - "All Markets" = null (default)
 * - Each market shows: flag emoji + displayName
 * - Hidden completely for single-market tenants (markets.length <= 1)
 * - Persists across navigation via Zustand persist middleware
 */
export function MarketSelector() {
  const markets = useDashboardStore((s) => s.markets);
  const selectedMarket = useDashboardStore((s) => s.selectedMarket);
  const setSelectedMarket = useDashboardStore((s) => s.setSelectedMarket);

  // Hide for single-market tenants
  if (markets.length <= 1) return null;

  return (
    <Select
      value={selectedMarket ?? 'all'}
      onValueChange={(value) =>
        setSelectedMarket(value === 'all' ? null : value)
      }
    >
      <SelectTrigger className="h-8 w-[160px] text-xs">
        <SelectValue placeholder="All Markets" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Markets</SelectItem>
        {markets.map((market) => (
          <SelectItem key={market.id} value={market.id}>
            {countryFlag(market.countryCode)} {market.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
