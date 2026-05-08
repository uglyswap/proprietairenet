import { query } from './db';
import { Resend } from 'resend';

const RESEND_KEY = process.env.RESEND_API_KEY || 're_Uf7EjMoK_9ar4JS3T7Af68HybEVezZPwk';
const FROM_EMAIL = process.env.EMAIL_FROM || 'Proprietaire.net <noreply@proprietaire.net>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://proprietaire.net';

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) _resend = new Resend(RESEND_KEY);
  return _resend;
}

interface OrgQuotaInfo {
  id: string;
  name: string;
  email: string;
  owner_email: string;
  owner_first_name: string | null;
  subscription_plan: string;
  credits_balance: number;
  credits_used: number;
  monthly_searches_used: number;
  monthly_searches_limit: number;
  stripe_customer_id: string | null;
}

/**
 * Check quota thresholds for a single org and send alerts if needed.
 * Called after credit/search consumption or via cron.
 *
 * Alert thresholds:
 * - Credits: 80% used (20% remaining), 100% used (0 remaining) — all plans
 * - Searches: 100% used — free plan only (upgrade CTA)
 */
export async function checkAndSendQuotaAlerts(orgId: string): Promise<void> {
  try {
    const orgResult = await query(
      `SELECT o.id, o.name, o.subscription_plan, o.credits_balance, o.credits_used,
              o.monthly_searches_used, o.monthly_searches_limit, o.stripe_customer_id,
              u.email as owner_email, u.first_name as owner_first_name
       FROM organizations o
       LEFT JOIN users u ON o.owner_id = u.id
       WHERE o.id = $1`,
      [orgId]
    );
    if (orgResult.rows.length === 0) return;
    const org = orgResult.rows[0] as OrgQuotaInfo;
    if (!org.owner_email) return;

    const totalCredits = org.credits_balance + org.credits_used;

    // --- Credits alerts (all plans) ---
    if (totalCredits > 0) {
      const usedPercent = (org.credits_used / totalCredits) * 100;

      // 100% used (0 remaining)
      if (org.credits_balance <= 0) {
        await sendAlertIfNew(org, 'credits_100', () =>
          sendQuotaEmail(org.owner_email, org.owner_first_name, {
            subject: '⚠️ Crédits épuisés — Proprietaire.net',
            heading: 'Vos crédits sont épuisés',
            message: 'Vous n\'avez plus aucun crédit disponible. Rechargez maintenant pour continuer à envoyer des courriers et enrichir vos contacts.',
            ctaText: 'Recharger mes crédits',
            ctaUrl: org.stripe_customer_id ? `${APP_URL}/api/stripe/portal` : `${APP_URL}/pricing`,
            urgent: true,
          })
        );
      }
      // 80% used (20% remaining)
      else if (usedPercent >= 80) {
        await sendAlertIfNew(org, 'credits_80', () =>
          sendQuotaEmail(org.owner_email, org.owner_first_name, {
            subject: '📊 Crédits bientôt épuisés — Proprietaire.net',
            heading: `Il vous reste ${org.credits_balance} crédit${org.credits_balance > 1 ? 's' : ''}`,
            message: `Vous avez utilisé ${org.credits_used} de vos ${totalCredits} crédits (${Math.round(usedPercent)}%). Pensez à recharger pour ne pas être bloqué.`,
            ctaText: 'Recharger mes crédits',
            ctaUrl: org.stripe_customer_id ? `${APP_URL}/api/stripe/portal` : `${APP_URL}/pricing`,
            urgent: false,
          })
        );
      }
    }

    // --- Searches alert (free plan only) ---
    if (org.subscription_plan === 'free' && org.monthly_searches_limit > 0) {
      if (org.monthly_searches_used >= org.monthly_searches_limit) {
        await sendAlertIfNew(org, 'searches_100', () =>
          sendQuotaEmail(org.owner_email, org.owner_first_name, {
            subject: '🔍 Limite de recherches atteinte — Proprietaire.net',
            heading: 'Vous avez atteint votre limite de recherches',
            message: `Vous avez utilisé vos ${org.monthly_searches_limit} recherches gratuites ce mois-ci. Passez au plan Starter pour des recherches illimitées !`,
            ctaText: 'Passer au plan Starter',
            ctaUrl: `${APP_URL}/pricing`,
            urgent: false,
          })
        );
      }
    }
  } catch (err) {
    console.error('[QUOTA-ALERTS] Error checking quotas for org', orgId, err);
  }
}

/**
 * Send alert only if not already sent for this org+type.
 */
async function sendAlertIfNew(
  org: OrgQuotaInfo,
  alertType: string,
  sendFn: () => Promise<boolean>
): Promise<void> {
  const existing = await query(
    'SELECT 1 FROM quota_alerts WHERE organization_id = $1 AND alert_type = $2',
    [org.id, alertType]
  );
  if (existing.rows.length > 0) return;

  const sent = await sendFn();
  if (sent) {
    await query(
      'INSERT INTO quota_alerts (organization_id, alert_type) VALUES ($1, $2) ON CONFLICT (organization_id, alert_type) DO NOTHING',
      [org.id, alertType]
    );
  }
}

/**
 * Reset alerts for an org (call after credit recharge or month reset).
 */
export async function resetQuotaAlerts(orgId: string, types?: string[]): Promise<void> {
  if (types && types.length > 0) {
    await query(
      'DELETE FROM quota_alerts WHERE organization_id = $1 AND alert_type = ANY($2)',
      [orgId, types]
    );
  } else {
    await query('DELETE FROM quota_alerts WHERE organization_id = $1', [orgId]);
  }
}

interface EmailParams {
  subject: string;
  heading: string;
  message: string;
  ctaText: string;
  ctaUrl: string;
  urgent: boolean;
}

async function sendQuotaEmail(
  email: string,
  firstName: string | null,
  params: EmailParams
): Promise<boolean> {
  try {
    const name = firstName || 'cher client';
    const borderColor = params.urgent ? '#dc2626' : '#f59e0b';
    const ctaBg = params.urgent ? '#dc2626' : '#2563eb';

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: params.subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; font-size: 28px; margin: 0;">Proprietaire.net</h1>
          </div>

          <div style="border-left: 4px solid ${borderColor}; padding: 16px 20px; background: ${params.urgent ? '#fef2f2' : '#fffbeb'}; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <h2 style="color: #111827; margin: 0 0 8px 0; font-size: 20px;">${params.heading}</h2>
            <p style="color: #374151; margin: 0; line-height: 1.6;">Bonjour ${name},</p>
          </div>

          <p style="color: #374151; line-height: 1.6; font-size: 15px;">${params.message}</p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${params.ctaUrl}" style="background: ${ctaBg}; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
              ${params.ctaText} →
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            © ${new Date().getFullYear()} Proprietaire.net — Tous droits réservés
          </p>
        </div>
      `,
    });
    console.log(`[QUOTA-ALERTS] Sent ${params.subject} to ${email}`);
    return true;
  } catch (err) {
    console.error('[QUOTA-ALERTS] Email send error:', err);
    return false;
  }
}
