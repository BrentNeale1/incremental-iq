import { NextRequest, NextResponse } from 'next/server';
import { withTenant, notifications } from '@incremental-iq/db';
import { eq, and, desc } from 'drizzle-orm';

/**
 * GET /api/notifications
 *
 * Returns in-app notifications for a tenant, most recent first.
 *
 * Query params:
 *   tenantId   (required) — UUID of the requesting tenant
 *   unreadOnly (optional) — 'true' to filter to unread notifications only
 *
 * Returns:
 *   200: NotificationRow[]
 *   400: { error: string }
 *
 * ---
 *
 * PATCH /api/notifications
 *
 * Marks one or more notifications as read.
 *
 * Body: { ids: string[], read: true }
 *
 * Query params:
 *   tenantId (required) — UUID of the requesting tenant
 *
 * Returns:
 *   200: { updated: number }
 *   400: { error: string }
 */

interface NotificationRow {
  id: string;
  type: string;
  message: string;
  linkPath: string | null;
  read: boolean;
  createdAt: Date;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get('tenantId');
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Missing required query parameter: tenantId' },
      { status: 400 },
    );
  }

  const conditions = [eq(notifications.tenantId, tenantId)];
  if (unreadOnly) {
    conditions.push(eq(notifications.read, false));
  }

  const rows: NotificationRow[] = await withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: notifications.id,
        type: notifications.type,
        message: notifications.message,
        linkPath: notifications.linkPath,
        read: notifications.read,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  });

  const result: NotificationRow[] = rows.map((row: NotificationRow) => ({
    id: row.id,
    type: row.type,
    message: row.message,
    linkPath: row.linkPath,
    read: row.read,
    createdAt: row.createdAt,
  }));

  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

  if (
    !body ||
    typeof body !== 'object' ||
    !Array.isArray((body as { ids?: unknown }).ids) ||
    (body as { read?: unknown }).read !== true
  ) {
    return NextResponse.json(
      { error: 'Body must be { ids: string[], read: true }' },
      { status: 400 },
    );
  }

  const { ids } = body as { ids: string[] };

  if (ids.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  // Mark all specified notification IDs as read (tenant-scoped via RLS)
  let updated = 0;
  await withTenant(tenantId, async (tx) => {
    for (const id of ids) {
      await tx
        .update(notifications)
        .set({ read: true })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
          ),
        );
      updated++;
    }
  });

  return NextResponse.json({ updated });
}
