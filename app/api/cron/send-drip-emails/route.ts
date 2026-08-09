import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { Resend } from "resend";
import logger from "@/lib/logger";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

// Init lazy: ne jamais construire Resend au chargement du module (sinon le build
// echoue si RESEND_API_KEY n'est pas presente au build-time). La cle vient
// exclusivement de l'environnement (aucun secret en dur).
let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    logger.error('DRIP', 'RESEND_API_KEY non configurée, envoi ignoré');
    return null;
  }
  _resend = new Resend(key);
  return _resend;
}
const FROM_EMAIL = process.env.EMAIL_FROM || "Proprietaire.net <noreply@proprietaire.net>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://proprietaire.net";

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function wrapHtml(title: string, body: string, ctaText?: string, ctaUrl?: string, unsubUserId?: string): string {
  const cta = ctaText && ctaUrl ? `
    <div style="text-align:center;margin:32px 0;">
      <a href="${ctaUrl}" style="display:inline-block;background:#2563EB;color:#ffffff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${ctaText}</a>
    </div>` : "";
  const unsub = unsubUserId ? `
    <p style="margin-top:8px;">
      <a href="${APP_URL}/api/cron/send-drip-emails?unsub=${unsubUserId}" style="color:#94A3B8;text-decoration:underline;font-size:12px;">Se désinscrire de ces emails</a>
    </p>` : "";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    <div style="text-align:center;padding:32px 0 24px;">
      <h1 style="margin:0;font-size:28px;font-weight:700;color:#2563EB;">Proprietaire.net</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#94A3B8;">Prospection immobilière intelligente</p>
    </div>
    <div style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <h2 style="margin:0 0 20px;font-size:22px;color:#1E293B;line-height:1.3;">${title}</h2>
      <div style="color:#1E293B;font-size:15px;line-height:1.7;">${body}</div>
      ${cta}
    </div>
    <div style="text-align:center;padding:24px 0;color:#94A3B8;font-size:12px;">
      <p style="margin:0;">Proprietaire.net</p>${unsub}
    </div>
  </div>
</body></html>`;
}

function getDripEmail(step: number, firstName: string, userId: string): { subject: string; html: string } | null {
  const name = escapeHtml(firstName || "cher utilisateur");

  switch (step) {
    case 1: // Jour 0 — Bienvenue
      return {
        subject: `${firstName || "Bienvenue"}, votre compte Proprietaire.net est prêt`,
        html: wrapHtml(
          `Bienvenue ${name} ! 🏠`,
          `<p>Votre compte est actif. Voici comment démarrer en 3 étapes :</p>
          <div style="background:#F0F9FF;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 12px;font-weight:600;color:#2563EB;">🔍 Étape 1 — Lancez votre première recherche</p>
            <p style="margin:0 0 16px;font-size:14px;">Tapez une adresse ou dessinez une zone sur la carte. En quelques secondes, vous obtenez la liste des propriétaires avec leur adresse postale.</p>
            <p style="margin:0 0 12px;font-weight:600;color:#2563EB;">✉️ Étape 2 — Configurez votre profil expéditeur</p>
            <p style="margin:0 0 16px;font-size:14px;">Dans Réglages, ajoutez votre société et adresse. Vos courriers auront un en-tête professionnel.</p>
            <p style="margin:0 0 12px;font-weight:600;color:#2563EB;">📮 Étape 3 — Envoyez votre premier courrier</p>
            <p style="margin:0;font-size:14px;">Choisissez un template adapté à votre métier, personnalisez-le, et cliquez sur Envoyer. Impression, mise sous pli, affranchissement — on gère tout.</p>
          </div>
          <p>Vous avez <strong>10 recherches gratuites par mois</strong> pour découvrir la plateforme.</p>`,
          "Accéder à mon dashboard →",
          `${APP_URL}/dashboard`,
          userId
        ),
      };

    case 2: // Jour 3 — Tuto recherche
      return {
        subject: "30 secondes pour trouver n'importe quel propriétaire",
        html: wrapHtml(
          "Votre première recherche en 30 secondes ⚡",
          `<p>${name}, avez-vous déjà testé la recherche ?</p>
          <p>C'est le cœur de Proprietaire.net. Deux méthodes, selon votre besoin :</p>
          <div style="background:#F0F9FF;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 12px;"><strong>🏠 Par adresse</strong> — Tapez une adresse précise et obtenez le propriétaire, la surface, le type de bien.</p>
            <p style="margin:0;"><strong>🗺️ Par zone géographique</strong> — Dessinez un rectangle sur la carte et récupérez <strong>tous les propriétaires</strong> du périmètre. Idéal pour prospecter un quartier entier.</p>
          </div>
          <p><strong>Astuce :</strong> La recherche par zone est particulièrement efficace pour identifier les propriétaires d’un immeuble, d’une rue ou d’un lotissement.</p>
          <p>Que vous soyez agent immobilier, marchand de biens, syndic, promoteur ou investisseur — les données sont les mêmes, c’est l’usage qui diffère.</p>`,
          "Lancer ma première recherche →",
          `${APP_URL}/dashboard`,
          userId
        ),
      };

    case 3: // Jour 5 — Courrier postal multi-métier
      return {
        subject: "Comment nos clients multiplient leurs opportunités par 3",
        html: wrapHtml(
          "Le courrier postal : l’arme secrète de la prospection 💬",
          `<p>${name}, saviez-vous que le courrier postal a un taux de retour <strong>8 à 15 fois supérieur</strong> aux emails de prospection ?</p>
          <p>Nos utilisateurs l’ont compris. Voici comment ils utilisent Proprietaire.net selon leur métier :</p>
          <div style="margin:20px 0;">
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">🏢 Agents immobiliers</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Prospection de quartier après une vente réussie. Courrier personnalisé aux voisins pour générer des estimations.</p>
            </div>
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">💰 Marchands de biens</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Identification de propriétaires dans des zones à fort potentiel. Offres d’achat directes par courrier.</p>
            </div>
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">🏗️ Promoteurs</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Repérage de parcelles constructibles. Contact des propriétaires pour propositions d’acquisition foncière.</p>
            </div>
            <div style="padding:12px 0;">
              <p style="margin:0;font-weight:600;">🏠 Syndics & gestionnaires</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Identification de tous les copropriétaires d’un immeuble. Communication officielle par courrier recommandé.</p>
            </div>
          </div>
          <p><strong>22 templates professionnels</strong> sont disponibles, classés par métier. Choisissez celui qui correspond à votre activité et personnalisez-le en quelques clics.</p>`,
          "Découvrir les templates →",
          `${APP_URL}/dashboard/courrier`,
          userId
        ),
      };

    case 4: // Jour 7 — Fonctionnalités avancées
      return {
        subject: "5 fonctionnalités que 80% des utilisateurs ne connaissent pas",
        html: wrapHtml(
          "Vous n’utilisez que 20% de la plateforme 🧊",
          `<p>${name}, la plupart des utilisateurs ne découvrent ces outils qu’après plusieurs semaines. Gagnez du temps :</p>
          <div style="margin:20px 0;">
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">📋 CRM intégré</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Chaque propriétaire contacté est ajouté automatiquement. Historique des courriers, notes, statut de la relation.</p>
            </div>
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">⭐ Listes & Favoris</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Organisez vos prospects par quartier, type de bien ou priorité. Retrouvez-les en un clic.</p>
            </div>
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">📊 Suivi & Analytics</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Suivez vos envois, mesurez les retours par template et par zone. Optimisez vos campagnes.</p>
            </div>
            <div style="padding:12px 0;border-bottom:1px solid #E2E8F0;">
              <p style="margin:0;font-weight:600;">📤 Export CSV</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Exportez vos résultats pour les intégrer dans vos outils existants.</p>
            </div>
            <div style="padding:12px 0;">
              <p style="margin:0;font-weight:600;">🤖 Génération IA</p>
              <p style="margin:4px 0 0;font-size:14px;color:#64748B;">Laissez l’IA rédiger vos courriers à partir de vos consignes. Un template sur mesure en quelques secondes.</p>
            </div>
          </div>`,
          "Explorer les fonctionnalités →",
          `${APP_URL}/dashboard`,
          userId
        ),
      };

    case 5: // Jour 10 — Offre -20%
      return {
        subject: `${firstName || ""}, -20% sur votre premier mois Pro`.trim(),
        html: wrapHtml(
          "Votre offre exclusive : -20% 🎉",
          `<p>${name}, vous utilisez Proprietaire.net depuis 10 jours. Prêt à passer à la vitesse supérieure ?</p>
          <div style="background:linear-gradient(135deg,#EFF6FF,#F0F9FF);border:2px solid #2563EB;border-radius:12px;padding:24px;margin:20px 0;text-align:center;">
            <p style="margin:0;font-size:14px;color:#2563EB;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Code promo exclusif</p>
            <p style="margin:8px 0;font-size:36px;font-weight:800;color:#1E293B;letter-spacing:2px;">WELCOME20</p>
            <p style="margin:0;font-size:16px;color:#2563EB;font-weight:600;">-20% sur votre premier mois Pro</p>
          </div>
          <p><strong>Ce que vous débloquez avec Pro :</strong></p>
          <div style="margin:16px 0;">
            <p style="margin:0 0 8px;">✅ Recherches <strong>illimitées</strong> (vs 10/mois en gratuit)</p>
            <p style="margin:0 0 8px;">✅ <strong>Envoi de courriers</strong> postaux directement depuis la plateforme</p>
            <p style="margin:0 0 8px;">✅ <strong>22 templates</strong> professionnels par métier</p>
            <p style="margin:0 0 8px;">✅ <strong>CRM complet</strong>, favoris, analytics</p>
            <p style="margin:0 0 8px;">✅ <strong>Génération IA</strong> de courriers personnalisés</p>
            <p style="margin:0;">✅ <strong>Multi-utilisateurs</strong> — invitez votre équipe</p>
          </div>
          <p style="font-size:14px;color:#64748B;">Offre valable 7 jours. Le code WELCOME20 est appliqué automatiquement.</p>`,
          "Passer en Pro avec -20% →",
          `${APP_URL}/pricing?promo=WELCOME20`,
          userId
        ),
      };

    case 6: // Jour 14 — Dernière chance
      return {
        subject: "Dernière chance : votre offre -20% expire ce soir",
        html: wrapHtml(
          "⏰ Votre offre expire ce soir",
          `<p>${name}, c’est votre dernier rappel.</p>
          <p>Votre code <strong>WELCOME20</strong> (-20% sur le premier mois Pro) expire ce soir à minuit.</p>
          <div style="background:#FEF2F2;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#991B1B;">Avec le plan gratuit :</p>
            <p style="margin:0 0 4px;color:#991B1B;">❌ 10 recherches par mois maximum</p>
            <p style="margin:0 0 4px;color:#991B1B;">❌ Pas d’envoi de courrier</p>
            <p style="margin:0;color:#991B1B;">❌ Pas de CRM, pas de templates, pas d’équipe</p>
          </div>
          <div style="background:#F0FDF4;border-radius:8px;padding:20px;margin:20px 0;">
            <p style="margin:0 0 8px;font-weight:600;color:#166534;">Avec Pro :</p>
            <p style="margin:0 0 4px;color:#166534;">✅ Recherches illimitées</p>
            <p style="margin:0 0 4px;color:#166534;">✅ Courrier postal intégré, 22 templates pros</p>
            <p style="margin:0;color:#166534;">✅ CRM, analytics, équipe, IA, support prioritaire</p>
          </div>
          <p style="text-align:center;font-size:18px;font-weight:700;color:#1E293B;">WELCOME20 — Plus que quelques heures.</p>`,
          "Activer mon offre -20% →",
          `${APP_URL}/pricing?promo=WELCOME20`,
          userId
        ),
      };

    default:
      return null;
  }
}

// ─── GET handler ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const unsubUserId = url.searchParams.get("unsub");
  if (unsubUserId) {
    try {
      await query(`UPDATE drip_email_queue SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending'`, [unsubUserId]);
      return new NextResponse(
        `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2>✅ Désinscription confirmée</h2>
          <p>Vous ne recevrez plus d’emails de la séquence de bienvenue.</p>
          <p><a href="${APP_URL}/dashboard">Retour au dashboard</a></p>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    } catch (err: any) {
      logger.error("DRIP", "Unsubscribe error", { error: err.message });
      return NextResponse.json({ error: "Erreur" }, { status: 500 });
    }
  }

  const cronSecret = url.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const upgraded = await query(`
      UPDATE drip_email_queue deq SET status = 'cancelled'
      FROM users u JOIN organizations o ON u.organization_id = o.id
      WHERE deq.user_id = u.id AND deq.status = 'pending' AND o.subscription_plan != 'free'
      RETURNING deq.id
    `);
    const cancelledCount = upgraded.rowCount || 0;

    const pending = await query(`
      SELECT deq.id, deq.user_id, deq.email, deq.step, u.first_name
      FROM drip_email_queue deq JOIN users u ON deq.user_id = u.id
      WHERE deq.status = 'pending' AND deq.scheduled_at <= now()
      ORDER BY deq.scheduled_at ASC LIMIT 50
    `);

    let sentCount = 0;
    let failCount = 0;

    for (const row of pending.rows) {
      // Idempotence: claime la ligne de maniere atomique avant l'envoi.
      // Deux executions concurrentes du cron ne peuvent pas envoyer le meme email :
      // seule celle qui fait passer 'pending' -> 'sending' obtient rowCount > 0.
      const claim = await query(
        `UPDATE drip_email_queue SET status = 'sending' WHERE id = $1 AND status = 'pending' RETURNING id`,
        [row.id]
      );
      if (!claim.rowCount) { continue; }

      const emailContent = getDripEmail(row.step, row.first_name, row.user_id);
      if (!emailContent) { await query(`UPDATE drip_email_queue SET status = 'failed' WHERE id = $1`, [row.id]); failCount++; continue; }
      const resend = getResend();
      if (!resend) {
        // Pas de cle configuree: ne pas perdre la ligne, la remettre en attente.
        await query(`UPDATE drip_email_queue SET status = 'pending' WHERE id = $1`, [row.id]);
        failCount++;
        continue;
      }
      try {
        // Resend v4 ne throw PAS sur erreur API : il retourne { data, error }.
        // On ne marque 'sent' que si error est null/absent.
        const { data, error } = await resend.emails.send({ from: FROM_EMAIL, to: row.email, subject: emailContent.subject, html: emailContent.html });
        if (error) {
          logger.error("DRIP", `Resend rejected step ${row.step} to ${row.email}`, { error: error.message, name: error.name });
          await query(`UPDATE drip_email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
          failCount++;
          continue;
        }
        await query(`UPDATE drip_email_queue SET status = 'sent', sent_at = now(), resend_message_id = $2 WHERE id = $1`, [row.id, data?.id || null]);
        sentCount++;
      } catch (sendErr: any) {
        logger.error("DRIP", `Failed step ${row.step} to ${row.email}`, { error: sendErr.message });
        await query(`UPDATE drip_email_queue SET status = 'failed' WHERE id = $1`, [row.id]);
        failCount++;
      }
    }

    logger.info("DRIP", `Cron: sent=${sentCount}, failed=${failCount}, cancelled=${cancelledCount}`);
    return NextResponse.json({ success: true, sent: sentCount, failed: failCount, cancelled: cancelledCount });
  } catch (err: any) {
    logger.error("DRIP", "Cron error", { error: err.message });
    return erreurServeur('cron/send-drip-emails', err);
  }
}
