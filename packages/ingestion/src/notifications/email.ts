import { Resend } from 'resend';

export interface CampaignRecommendation {
  campaignName: string;
  action: string;
}

/**
 * Get the Resend client instance, lazily initialized.
 * Returns null if RESEND_API_KEY is not configured — all sends become no-ops.
 */
function getResendClient(): Resend | null {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    console.warn('[notifications/email] RESEND_API_KEY not configured — email notifications disabled');
    return null;
  }
  return new Resend(apiKey);
}

/** Sender address — configurable via RESEND_FROM_EMAIL env var. */
const FROM_EMAIL = process.env['RESEND_FROM_EMAIL'] ?? 'alerts@incremental-iq.com';

/**
 * Sends a data health alert email to the tenant's email address.
 *
 * No-ops gracefully if RESEND_API_KEY is not configured.
 *
 * @param to              - Recipient email address
 * @param integrationName - Display name of the stale integration
 * @param staleDays       - Number of days since last successful sync
 * @param reconnectUrl    - URL to reconnect the integration
 */
export async function sendDataHealthEmail(
  to: string,
  integrationName: string,
  staleDays: number,
  reconnectUrl: string,
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const subject = `Action required: ${integrationName} data is ${staleDays} ${staleDays === 1 ? 'day' : 'days'} stale`;

  // Build HTML inline to avoid tsx compilation dependency in ingestion package
  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="background-color:#f9fafb;font-family:sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:40px auto;background-color:#ffffff;border-radius:8px;padding:40px">
    <h1 style="color:#111827;font-size:20px;font-weight:600;margin:0 0 16px">Data sync issue detected</h1>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px">
      Your <strong>${integrationName}</strong> integration has not synced successfully
      in the last <strong>${staleDays} ${staleDays === 1 ? 'day' : 'days'}</strong>.
      Dashboard metrics may be out of date.
    </p>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">
      Reconnect your account to restore automatic data syncing and keep your recommendations accurate.
    </p>
    <div style="text-align:center;margin:0 0 32px">
      <a href="${reconnectUrl}" style="background-color:#2563eb;color:#ffffff;border-radius:6px;font-size:15px;font-weight:600;padding:12px 28px;text-decoration:none;display:inline-block">
        Reconnect ${integrationName}
      </a>
    </div>
    <hr style="border-color:#e5e7eb;margin:0 0 24px" />
    <p style="color:#9ca3af;font-size:12px;margin:0">
      You received this email because data health alerts are enabled for your account.
    </p>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notifications/email] Failed to send data health email: ${message}`);
  }
}

/**
 * Sends a seasonal deadline email to the tenant's email address.
 *
 * No-ops gracefully if RESEND_API_KEY is not configured.
 *
 * @param to              - Recipient email address
 * @param eventName       - Name of the upcoming retail event
 * @param weeksUntil      - Number of weeks until the event
 * @param recommendations - Array of campaign name + action pairs
 */
export async function sendSeasonalDeadlineEmail(
  to: string,
  eventName: string,
  weeksUntil: number,
  recommendations: CampaignRecommendation[],
): Promise<void> {
  const resend = getResendClient();
  if (!resend) return;

  const subject = `${eventName} in ${weeksUntil} ${weeksUntil === 1 ? 'week' : 'weeks'} — prepare your campaigns`;

  const recommendationsHtml =
    recommendations.length > 0
      ? `
    <div style="background-color:#f3f4f6;border-radius:6px;padding:16px;margin:0 0 24px">
      <p style="color:#111827;font-size:13px;font-weight:600;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em">Campaign Recommendations</p>
      ${recommendations
        .map(
          (rec) => `
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#374151;font-size:14px;font-weight:500">${rec.campaignName}</span>
        <span style="color:#2563eb;font-size:14px">${rec.action}</span>
      </div>`,
        )
        .join('')}
    </div>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="background-color:#f9fafb;font-family:sans-serif;margin:0;padding:0">
  <div style="max-width:560px;margin:40px auto;background-color:#ffffff;border-radius:8px;padding:40px">
    <h1 style="color:#111827;font-size:20px;font-weight:600;margin:0 0 8px">
      ${eventName} is ${weeksUntil} ${weeksUntil === 1 ? 'week' : 'weeks'} away
    </h1>
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">
      Based on your historical performance data, here are the recommended budget
      adjustments to maximize incremental lift during ${eventName}.
    </p>
    ${recommendationsHtml}
    <div style="text-align:center;margin:0 0 32px">
      <a href="https://app.incremental-iq.com/seasonality" style="background-color:#2563eb;color:#ffffff;border-radius:6px;font-size:15px;font-weight:600;padding:12px 28px;text-decoration:none;display:inline-block">
        View Seasonality Planning
      </a>
    </div>
    <hr style="border-color:#e5e7eb;margin:0 0 24px" />
    <p style="color:#9ca3af;font-size:12px;margin:0">
      You received this email because seasonal deadline alerts are enabled for your account.
    </p>
  </div>
</body>
</html>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notifications/email] Failed to send seasonal deadline email: ${message}`);
  }
}
