/**
 * Notification module — in-app notification generation and email delivery.
 *
 * Functions:
 *   generateNotification           — Insert a notification record into the DB
 *   checkAndNotifyDataHealth       — Check for stale integrations + notify
 *   checkAndNotifySeasonalDeadlines — Check upcoming seasonal events + notify
 *   checkAndNotifyNewRecommendations — Notify after new scale_up recommendations
 *
 *   sendDataHealthEmail            — Send data health alert via Resend
 *   sendSeasonalDeadlineEmail      — Send seasonal deadline alert via Resend
 */
export {
  generateNotification,
  checkAndNotifyDataHealth,
  checkAndNotifySeasonalDeadlines,
  checkAndNotifyNewRecommendations,
} from './generate';

export {
  sendDataHealthEmail,
  sendSeasonalDeadlineEmail,
  type CampaignRecommendation,
} from './email';
