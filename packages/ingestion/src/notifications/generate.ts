import { db, notifications, syncRuns, integrations, seasonalEvents } from '@incremental-iq/db';
import { eq, and, desc, gt, sql } from 'drizzle-orm';
import { sendDataHealthEmail, sendSeasonalDeadlineEmail } from './email';
import type { CampaignRecommendation } from './email';

/**
 * Inserts a notification record into the database.
 *
 * @param tenantId - UUID of the tenant
 * @param type     - Notification type: 'recommendation' | 'anomaly' | 'seasonal' | 'data_health'
 * @param message  - Human-readable notification message
 * @param linkPath - Optional dashboard path to navigate to on click
 */
export type NotificationType =
  | 'anomaly_detected'
  | 'recommendation_ready'
  | 'seasonal_alert'
  | 'data_health';

export async function generateNotification(
  tenantId: string,
  type: NotificationType,
  message: string,
  linkPath?: string,
): Promise<void> {
  await db.insert(notifications).values({
    tenantId,
    type,
    message,
    linkPath: linkPath ?? null,
    read: false,
  });
}

/**
 * Checks for stale integrations and generates data health notifications + emails.
 *
 * A stale integration is one where the last successful sync is >24 hours ago.
 * Sends a notification and email for each stale integration.
 *
 * Called from the ingestion worker's error handler and the nightly scoring run.
 *
 * @param tenantId      - UUID of the tenant
 * @param tenantEmail   - Email address to send alerts to (optional)
 * @param appBaseUrl    - Base URL for reconnect links (e.g. "https://app.incremental-iq.com")
 */
export async function checkAndNotifyDataHealth(
  tenantId: string,
  tenantEmail?: string,
  appBaseUrl = 'https://app.incremental-iq.com',
): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch integrations for this tenant
  const tenantIntegrations = await db
    .select({
      id: integrations.id,
      platform: integrations.platform,
      accountName: integrations.accountName,
    })
    .from(integrations)
    .where(eq(integrations.tenantId, tenantId));

  for (const integration of tenantIntegrations) {
    // Check last successful sync time (status 'success' matches schema)
    const lastSuccessfulSync = await db
      .select({ completedAt: syncRuns.completedAt })
      .from(syncRuns)
      .where(
        and(
          eq(syncRuns.integrationId, integration.id),
          eq(syncRuns.status, 'success'),
        ),
      )
      .orderBy(desc(syncRuns.completedAt))
      .limit(1);

    const lastSync = lastSuccessfulSync[0]?.completedAt;
    const isStale = !lastSync || lastSync < oneDayAgo;

    if (!isStale) continue;

    const staleDays = lastSync
      ? Math.floor((Date.now() - lastSync.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    const platformLabel =
      integration.accountName
        ? `${integration.platform} (${integration.accountName})`
        : integration.platform;

    const message = staleDays > 0
      ? `${platformLabel} data is ${staleDays} ${staleDays === 1 ? 'day' : 'days'} stale — reconnect to resume syncing`
      : `${platformLabel} has not synced yet — connect to start syncing`;

    const reconnectUrl = `${appBaseUrl}/api/oauth/${integration.platform}`;

    // Generate in-app notification
    await generateNotification(tenantId, 'data_health' as NotificationType, message, '/health');

    // Send email if address is available
    if (tenantEmail && staleDays > 0) {
      await sendDataHealthEmail(tenantEmail, platformLabel, staleDays, reconnectUrl);
    }
  }
}

/**
 * Checks for upcoming seasonal events and generates seasonal deadline notifications.
 *
 * Events within 6 weeks trigger a notification + email if not already sent
 * for this tenant + event combination in the past 7 days.
 *
 * @param tenantId    - UUID of the tenant
 * @param tenantEmail - Email address for seasonal alerts (optional)
 */
export async function checkAndNotifySeasonalDeadlines(
  tenantId: string,
  tenantEmail?: string,
): Promise<void> {
  const sixWeeksFromNow = new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000);
  const sixWeeksDateStr = sixWeeksFromNow.toISOString().split('T')[0];

  // Get upcoming seasonal events within 6 weeks (system events + tenant-specific)
  // seasonalEvents.eventDate is a date column (string 'YYYY-MM-DD' in JS)
  const upcomingEvents = await db
    .select({
      id: seasonalEvents.id,
      name: seasonalEvents.name,
      eventDate: seasonalEvents.eventDate,
    })
    .from(seasonalEvents)
    .where(
      and(
        gt(seasonalEvents.eventDate, sql`CURRENT_DATE`),
        sql`${seasonalEvents.eventDate} <= ${sixWeeksDateStr}`,
        sql`(${seasonalEvents.tenantId} IS NULL OR ${seasonalEvents.tenantId} = ${tenantId})`,
      ),
    );

  for (const event of upcomingEvents) {
    // eventDate is a string 'YYYY-MM-DD' — convert to Date for arithmetic
    const eventDateMs = new Date(event.eventDate).getTime();
    const weeksUntil = Math.ceil(
      (eventDateMs - Date.now()) / (7 * 24 * 60 * 60 * 1000),
    );

    // Check if we already notified this tenant about this event in the last 7 days
    const recentNotification = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.type, 'seasonal_alert'),
          sql`${notifications.message} ILIKE ${'%' + event.name + '%'}`,
          gt(notifications.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);

    if (recentNotification.length > 0) continue;

    const message = `${event.name} is ${weeksUntil} ${weeksUntil === 1 ? 'week' : 'weeks'} away — review your seasonal budget plan`;

    await generateNotification(tenantId, 'seasonal_alert', message, '/seasonality');

    if (tenantEmail) {
      await sendSeasonalDeadlineEmail(tenantEmail, event.name, weeksUntil, []);
    }
  }
}

/**
 * Checks for new scale_up recommendations and generates recommendation notifications.
 *
 * Called after each scoring run completes. Compares notification history
 * to avoid duplicate notifications for the same campaign.
 *
 * @param tenantId          - UUID of the tenant
 * @param newRecommendations - Recently generated recommendations with campaign context
 */
export async function checkAndNotifyNewRecommendations(
  tenantId: string,
  newRecommendations: Array<{
    campaignId: string;
    campaignName: string;
    action: 'scale_up' | 'scale_down' | 'watch' | 'investigate';
    recommendedBudgetChange: number;
  }>,
): Promise<void> {
  const scaleUpRecs = newRecommendations.filter((r) => r.action === 'scale_up');

  if (scaleUpRecs.length === 0) return;

  // Check which campaigns we've already notified about recently (last 24h)
  for (const rec of scaleUpRecs) {
    const recentNotification = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, tenantId),
          eq(notifications.type, 'recommendation_ready'),
          sql`${notifications.message} ILIKE ${'%' + rec.campaignName + '%'}`,
          gt(notifications.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ),
      )
      .limit(1);

    if (recentNotification.length > 0) continue;

    const changePct = Math.round(rec.recommendedBudgetChange * 100);
    const message = `New recommendation: Scale up ${rec.campaignName} by ${changePct}% for higher incremental lift`;

    await generateNotification(tenantId, 'recommendation_ready', message, '/');
  }
}
