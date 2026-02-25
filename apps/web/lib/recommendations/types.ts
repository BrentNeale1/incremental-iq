/**
 * Recommendation engine types.
 *
 * These types represent the output of the recommendation engine, which reads
 * incrementality scores and saturation estimates from Phase 3 and converts
 * them into actionable advice for marketers.
 */

export type RecommendationAction = 'scale_up' | 'watch' | 'investigate';
export type RecommendationConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface Recommendation {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: string;

  // Market context — populated when campaign is assigned to a market
  marketId?: string;              // UUID from campaign_markets.market_id (null = Global/Unassigned)
  marketName?: string;            // Human-readable: "United States", "Australia"
  marketCountryCode?: string;     // ISO 3166-1 alpha-2 for flag emoji: "US", "AU"

  action: RecommendationAction;
  confidenceLevel: RecommendationConfidenceLevel;

  // Scale-up specifics (when action === 'scale_up')
  budgetIncreasePct?: number;            // e.g., 25 (percent)
  currentDailySpend?: number;            // e.g., 500.00
  proposedDailySpend?: number;           // e.g., 625.00
  durationWeeks?: number;                // e.g., 3
  expectedIncrementalRevenue?: number;   // e.g., 12000.00

  // Statistical detail (analyst view)
  liftMean?: number;
  liftLower?: number;
  liftUpper?: number;
  confidence?: number;
  saturationPct?: number;

  // Low-confidence path
  // nextAnalysisDate: ISO date string (7 days from now, shown as "check back on {date}")
  nextAnalysisDate?: string;
  // holdoutTestDesign: ONLY populated when confidence < SCALE_UP_CONFIDENCE_THRESHOLD.
  // The engine guarantees this field is absent on high-confidence recommendations.
  // RECC-06: UI checks this field's existence to decide whether to offer holdout option.
  holdoutTestDesign?: HoldoutTestDesign;

  // Ranking — sort key: expectedIncrementalRevenue for scale_up, or confidence * currentDailySpend
  expectedImpact: number;

  // Seasonal context
  seasonalAlert?: SeasonalAlert;
}

export interface HoldoutTestDesign {
  holdbackPct: number;          // e.g., 10 (%)
  durationWeeks: number;        // e.g., 2
  estimatedSampleSize: number;  // approximate impressions during test window
  description: string;          // human-readable: "Hold back 10% of spend for 2 weeks"
}

export interface SeasonalAlert {
  eventName: string;           // e.g., "BFCM"
  weeksUntil: number;          // e.g., 6
  message: string;             // e.g., "BFCM in 6 weeks: Campaign X scaled +40% last year"
  historicalLiftPct?: number;  // e.g., 40 (from last year's incrementality scores)
}
