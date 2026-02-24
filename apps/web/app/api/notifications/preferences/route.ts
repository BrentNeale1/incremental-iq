import { NextRequest, NextResponse } from 'next/server';
import { withTenant, userPreferences } from '@incremental-iq/db';
import { eq } from 'drizzle-orm';

/**
 * GET /api/notifications/preferences
 *
 * Returns the user's notification preferences.
 * Creates default preferences if none exist.
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Returns:
 *   200: UserPreferences
 *   400: { error: string }
 *
 * ---
 *
 * PUT /api/notifications/preferences
 *
 * Updates (upserts) the user's notification preferences.
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Body: Partial<NotificationPreferences>
 *   {
 *     anomaly_detected?:     { in_app: boolean; email: boolean }
 *     recommendation_ready?: { in_app: boolean; email: boolean }
 *     seasonal_alert?:       { in_app: boolean; email: boolean }
 *     data_health?:          { in_app: boolean; email: boolean }
 *   }
 *
 * Returns:
 *   200: UserPreferences (updated)
 *   400: { error: string }
 */

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, { in_app: boolean; email: boolean }> = {
  anomaly_detected:     { in_app: true,  email: false },
  recommendation_ready: { in_app: true,  email: false },
  seasonal_alert:       { in_app: true,  email: true  },
  data_health:          { in_app: true,  email: true  },
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  const rows = await withTenant(tenantId, async (tx) => {
    return tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.tenantId, tenantId))
      .limit(1);
  });

  if (rows.length === 0) {
    // Return default preferences without creating a row
    return NextResponse.json({
      tenantId,
      viewMode: 'executive',
      darkMode: false,
      kpiOrder: ['spend', 'revenue', 'roas', 'incremental_revenue'],
      brandColors: null,
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    });
  }

  return NextResponse.json(rows[0]);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Body must be an object with notification preferences' },
      { status: 400 },
    );
  }

  const updates = body as Record<string, { in_app: boolean; email: boolean }>;

  // Fetch existing preferences
  const existing = await withTenant(tenantId, async (tx) => {
    return tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.tenantId, tenantId))
      .limit(1);
  });

  const currentPrefs =
    (existing[0]?.notificationPreferences as Record<string, { in_app: boolean; email: boolean }> | null) ??
    DEFAULT_NOTIFICATION_PREFERENCES;

  const mergedPrefs = { ...currentPrefs, ...updates };

  // Upsert preferences
  const updatedRows = await withTenant(tenantId, async (tx) => {
    return tx
      .insert(userPreferences)
      .values({
        tenantId,
        notificationPreferences: mergedPrefs,
      })
      .onConflictDoUpdate({
        target: userPreferences.tenantId,
        set: {
          notificationPreferences: mergedPrefs,
        },
      })
      .returning();
  });

  return NextResponse.json(updatedRows[0]);
}
