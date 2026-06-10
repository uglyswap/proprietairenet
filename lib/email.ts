import { Resend } from 'resend';

// Lazy init to avoid build-time errors.
// Si la cle est absente, on lance une erreur explicite plutot qu'un stub qui
// simule un succes: les appelants (try/catch) renverront false, et on ne pretend
// jamais avoir envoye un email (ex: reinitialisation de mot de passe) qui ne part pas.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('[EMAIL] RESEND_API_KEY non configuree');
    }
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Proprietaire.net <noreply@proprietaire.net>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://proprietaire.net';

// Welcome email after registration
export async function sendWelcomeEmail(email: string, firstName?: string) {
  try {
    const name = firstName || 'cher utilisateur';
    
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Bienvenue sur Proprietaire.net ! 🏠',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; font-size: 28px; margin: 0;">Proprietaire.net</h1>
            <p style="color: #6b7280; font-size: 14px;">Trouvez n'importe quel propriétaire en France</p>
          </div>
          
          <h2 style="color: #111827;">Bienvenue ${name} ! 🎉</h2>
          
          <p style="color: #374151; line-height: 1.6;">
            Votre compte a été créé avec succès. Vous recevez <strong>10 crédits gratuits</strong> et <strong>10 recherches/mois</strong> pour découvrir la plateforme.
          </p>
          
          <div style="background: #f0f9ff; border-radius: 12px; padding: 20px; margin: 24px 0;">
            <h3 style="color: #1e40af; margin-top: 0;">Ce que vous pouvez faire :</h3>
            <ul style="color: #374151; line-height: 1.8;">
              <li>🔍 Rechercher des propriétaires par adresse</li>
              <li>🗺️ Dessiner une zone sur la carte pour trouver tous les propriétaires</li>
              <li>🏢 Rechercher par SIREN ou nom de société</li>
              <li>📧 Enrichir les contacts (email, téléphone du dirigeant)</li>
              <li>📤 Exporter vos résultats en CSV/JSON</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/dashboard" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Commencer ma recherche →
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            © 2026 Proprietaire.net — Tous droits réservés
          </p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('[EMAIL] Welcome email failed:', error);
    return false;
  }
}

// Password reset email
export async function sendPasswordResetEmail(email: string, resetToken: string, firstName?: string) {
  try {
    const name = firstName || 'cher utilisateur';
    const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Réinitialisation de votre mot de passe — Proprietaire.net',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; font-size: 28px; margin: 0;">Proprietaire.net</h1>
          </div>
          
          <h2 style="color: #111827;">Bonjour ${name},</h2>
          
          <p style="color: #374151; line-height: 1.6;">
            Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
              Réinitialiser mon mot de passe
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 13px;">
            Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
          </p>
          
          <p style="color: #9ca3af; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Si le bouton ne fonctionne pas, copiez ce lien : ${resetUrl}
          </p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('[EMAIL] Reset email failed:', error);
    return false;
  }
}

// Search limit reached email (upsell)
export async function sendUpgradeEmail(email: string, firstName?: string) {
  try {
    const name = firstName || 'cher utilisateur';

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Vous avez atteint votre limite — Passez au plan Pro ! 🚀',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; font-size: 28px; margin: 0;">Proprietaire.net</h1>
          </div>
          
          <h2 style="color: #111827;">Bonjour ${name},</h2>
          
          <p style="color: #374151; line-height: 1.6;">
            Vous avez utilisé vos 10 recherches gratuites ce mois-ci. C'est la preuve que notre outil vous est utile ! 💪
          </p>
          
          <p style="color: #374151; line-height: 1.6;">
            Passez au <strong>plan Starter à 49€/mois</strong> pour débloquer :
          </p>
          
          <ul style="color: #374151; line-height: 1.8;">
            <li>✅ Recherches <strong>illimitées</strong></li>
            <li>✅ 50 crédits d'enrichissement</li>
            <li>✅ Export CSV/JSON</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${APP_URL}/pricing" style="background: linear-gradient(135deg, #2563eb, #16a34a); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Voir les plans →
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 13px; text-align: center; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            © 2026 Proprietaire.net
          </p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('[EMAIL] Upgrade email failed:', error);
    return false;
  }
}
