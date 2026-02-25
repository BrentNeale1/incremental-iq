import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'executive' | 'analyst';
export type OutcomeMode = 'ecommerce' | 'lead_gen';

export interface DateRange {
  from: Date;
  to: Date;
}

export interface MarketInfo {
  id: string;
  countryCode: string;
  displayName: string;
  campaignCount: number;
}

interface DashboardState {
  /** Date range for the primary data window — default last 30 days. Not persisted. */
  dateRange: DateRange;
  /** Comparison date range for period-over-period metrics. Not persisted. */
  comparisonRange: DateRange | null;
  /** Whether the comparison period toggle is enabled. Not persisted. */
  comparisonEnabled: boolean;
  /** Dashboard view mode: 'executive' (simplified) or 'analyst' (full stats). Persisted. */
  viewMode: ViewMode;
  /** Ordered array of KPI metric keys. Persisted. */
  kpiOrder: string[];
  /** Selected market filter — null means "All Markets". Persisted. */
  selectedMarket: string | null;
  /** Available markets for this tenant — loaded from API. Not persisted. */
  markets: MarketInfo[];
  /** Tenant outcome mode — gates terminology (revenue vs leads). Not persisted. */
  outcomeMode: OutcomeMode;

  // Setters
  setDateRange: (range: DateRange) => void;
  setComparisonRange: (range: DateRange | null) => void;
  setComparisonEnabled: (enabled: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setKpiOrder: (order: string[]) => void;
  setSelectedMarket: (marketId: string | null) => void;
  setMarkets: (markets: MarketInfo[]) => void;
  setOutcomeMode: (mode: OutcomeMode) => void;
}

/** Last 30 days helper — called at store initialization */
function getLast30Days(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

/**
 * Global dashboard Zustand store.
 *
 * Persists only `viewMode` and `kpiOrder` to localStorage via the persist
 * middleware (using `partialize`). Date ranges and comparison state are
 * transient — reset on page load.
 *
 * CRITICAL: `skipHydration: true` prevents Next.js SSR hydration mismatch.
 * The client must call `useDashboardStore.persist.rehydrate()` once after
 * mounting (typically in a top-level layout useEffect) to load persisted state.
 */
export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      dateRange: getLast30Days(),
      comparisonRange: null,
      comparisonEnabled: false,
      viewMode: 'executive',
      kpiOrder: ['spend', 'revenue', 'roas', 'incremental_revenue'],
      selectedMarket: null,
      markets: [],
      outcomeMode: 'ecommerce' as OutcomeMode,

      setDateRange: (range) => set({ dateRange: range }),
      setComparisonRange: (range) => set({ comparisonRange: range }),
      setComparisonEnabled: (enabled) => set({ comparisonEnabled: enabled }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setKpiOrder: (order) => set({ kpiOrder: order }),
      setSelectedMarket: (marketId) => set({ selectedMarket: marketId }),
      setMarkets: (markets) => set({ markets }),
      setOutcomeMode: (mode) => set({ outcomeMode: mode }),
    }),
    {
      name: 'dashboard-store',
      // Persist viewMode, kpiOrder, and selectedMarket — date ranges are transient
      partialize: (state) => ({
        viewMode: state.viewMode,
        kpiOrder: state.kpiOrder,
        selectedMarket: state.selectedMarket,
      }),
      // CRITICAL: skipHydration prevents SSR hydration mismatch in Next.js App Router
      // The client must call useDashboardStore.persist.rehydrate() after mounting
      skipHydration: true,
    },
  ),
);
