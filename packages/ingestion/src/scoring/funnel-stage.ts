/**
 * Funnel stage auto-assignment from campaign objective metadata.
 *
 * Maps platform-specific campaign objectives to the 3-stage funnel model:
 *   Awareness -> Consideration -> Conversion
 *
 * The funnel stage is the second dimension in the 4-level score hierarchy:
 *   Campaign -> Cluster (Platform x Funnel Stage) -> Channel (Platform) -> Overall
 *
 * Per user decision: "auto-assigned from campaign objective, users can reassign"
 * — only auto-assigns if funnelStage is still the default value ('conversion').
 * Users who have manually set a stage are not overridden.
 */

import { eq, and } from 'drizzle-orm';
import { db, withTenant, campaigns } from '@incremental-iq/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FunnelStage = 'awareness' | 'consideration' | 'conversion';

// ---------------------------------------------------------------------------
// Objective keyword mapping
// ---------------------------------------------------------------------------

/**
 * Objective keywords for each funnel stage.
 *
 * Checked case-insensitively against the campaign's `status` field
 * (which stores objective/type metadata) and the campaign name.
 * Includes both human-readable and platform API enum values.
 */
const AWARENESS_KEYWORDS = [
  'brand',
  'awareness',
  'reach',
  'video_views',
  'brand_awareness',
  'video views',
  'thruplay',
  'impressions',
];

const CONSIDERATION_KEYWORDS = [
  'traffic',
  'engagement',
  'consideration',
  'website_traffic',
  'lead',
  'leads',
  'app_installs',
  'app installs',
  'messages',
  'video_views',     // Meta consideration objective also uses video_views sometimes
  'store_visits',
];

const CONVERSION_KEYWORDS = [
  'conversion',
  'conversions',
  'sales',
  'purchase',
  'catalog',
  'shopping',
  'outcome_sales',
  'outcome_leads',   // Some platforms classify lead-gen as conversion
  'product_catalog_sales',
  'store_traffic',
  'app_promotion',
];

// ---------------------------------------------------------------------------
// Core mapping function
// ---------------------------------------------------------------------------

/**
 * Map a campaign objective string to a funnel stage.
 *
 * Checks Conversion keywords first (most specific), then Consideration,
 * then Awareness. Falls back to 'conversion' per user decision
 * ("default to conversion — most campaigns are performance-focused").
 *
 * @param objective - Raw objective string from campaign metadata.
 * @returns Matched funnel stage, or 'conversion' if no match found.
 */
export function mapObjectiveToFunnelStage(objective: string): FunnelStage {
  const lower = objective.toLowerCase();

  // Check conversion first (highest specificity)
  for (const kw of CONVERSION_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return 'conversion';
    }
  }

  // Check awareness keywords
  for (const kw of AWARENESS_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return 'awareness';
    }
  }

  // Check consideration keywords
  for (const kw of CONSIDERATION_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return 'consideration';
    }
  }

  // Default: conversion (per user decision)
  return 'conversion';
}

// ---------------------------------------------------------------------------
// Auto-assignment
// ---------------------------------------------------------------------------

/**
 * Auto-assign funnel stage for a campaign if it hasn't been manually set.
 *
 * Reads the campaign's `status` field as a proxy for objective metadata
 * (platforms store objective in different fields; status is normalized at ingestion).
 * Also checks campaign name as a fallback signal.
 *
 * Only auto-assigns if funnelStage is currently null or the default value ('conversion').
 * Campaigns where users have explicitly set a non-default stage are left unchanged.
 *
 * @param db_        - Drizzle DB instance (passed as parameter for testability).
 * @param tenantId   - Tenant UUID for RLS context.
 * @param campaignId - Campaign UUID to assign stage for.
 * @returns The assigned (or existing) funnel stage.
 */
export async function assignFunnelStage(
  tenantId: string,
  campaignId: string,
): Promise<FunnelStage> {
  return withTenant(tenantId, async () => {
    const [campaign] = await db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        status: campaigns.status,
        funnelStage: campaigns.funnelStage,
      })
      .from(campaigns)
      .where(and(
        eq(campaigns.id, campaignId),
        eq(campaigns.tenantId, tenantId),
      ))
      .limit(1);

    if (!campaign) {
      // Campaign not found — return default
      return 'conversion';
    }

    // Per user decision: only auto-assign if funnelStage is null or default
    // Users who manually set a non-default stage are not overridden.
    // We auto-assign if: null OR 'conversion' (the Drizzle schema default).
    // This means if the user explicitly set 'awareness' or 'consideration', we skip.
    const currentStage = campaign.funnelStage as FunnelStage | null;
    const isDefaultOrNull = currentStage === null || currentStage === 'conversion';

    if (!isDefaultOrNull) {
      // User has manually set a non-default stage — respect it
      return currentStage as FunnelStage;
    }

    // Derive stage from available objective signals:
    // - campaign.status stores platform objective enum (e.g., 'CONVERSIONS', 'BRAND_AWARENESS')
    // - campaign.name as a fallback signal
    const objectiveSignal = [
      campaign.status ?? '',
      campaign.name,
    ].join(' ');

    const assignedStage = mapObjectiveToFunnelStage(objectiveSignal);

    // Only update if we're actually changing the value
    if (assignedStage !== currentStage) {
      await db
        .update(campaigns)
        .set({ funnelStage: assignedStage })
        .where(and(
          eq(campaigns.id, campaignId),
          eq(campaigns.tenantId, tenantId),
        ));
    }

    return assignedStage;
  });
}
