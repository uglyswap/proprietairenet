import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAdminUser } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import { logAudit, getIpFromRequest } from '@/lib/audit';
import { textToPdfBase64, replaceVariables } from '@/lib/pdf-generator';
import { spFetch, isConfigured, getCreditCost } from '@/lib/service-postal';
import { checkAndSendQuotaAlerts } from '@/lib/quota-alerts';
import { requireFeature } from "@/lib/plan-features";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'campagnes');
    if (refusPlan) return refusPlan;

    const denied = await checkPermission(auth, 'courrier.bulk');
    if (denied) return denied;

    if (!isConfigured()) return NextResponse.json({ error: 'Service courrier non configuré' }, { status: 503 });

    const body = await req.json();
    const { campaign_id, recipients, type_affranchissement = 'verte', couleur = 'nb', recto_verso = 'rectoverso' } = body;

    if (!campaign_id) return NextResponse.json({ error: 'campaign_id requis' }, { status: 400 });
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: 'Destinataires requis' }, { status: 400 });
    }

    // Get campaign
    const campResult = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2',
      [campaign_id, auth.user.organization_id]
    );
    if (campResult.rows.length === 0) return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 });
    const campaign = campResult.rows[0];

    // Prevent double-send
    if (campaign.status === 'active' || campaign.status === 'completed') {
      return NextResponse.json({ error: 'Cette campagne a déjà été envoyée' }, { status: 409 });
    }

    if (!campaign.template_a_content) return NextResponse.json({ error: 'Template A manquant' }, { status: 400 });

    const hasB = !!campaign.template_b_content;
    const splitRatio = campaign.split_ratio || 50;
    const adminBypass = isAdminUser(auth);

    const orgId = auth.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: 'Aucune organisation associée' }, { status: 400 });
    }

    // Get org for sender info
    const orgResult = await query(
      `SELECT credits_balance, name, sender_company, sender_address, sender_address2,
              sender_postal_code, sender_city, sender_country, sender_civilite,
              sender_first_name, sender_last_name
       FROM organizations WHERE id = $1`,
      [orgId]
    );
    const org = orgResult.rows[0];
    if (!org) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    const unitCost = getCreditCost(type_affranchissement);
    const totalCost = unitCost * recipients.length;

    // Verrou anti double-envoi ATOMIQUE: passe la campagne en 'active' uniquement si
    // elle ne l'est pas deja (TOCTOU corrige vs simple lecture de status plus haut).
    const claimCampaign = await query(
      "UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = $1 AND organization_id = $2 AND status NOT IN ('active','completed') RETURNING id",
      [campaign_id, orgId]
    );
    if (claimCampaign.rows.length === 0) {
      return NextResponse.json({ error: 'Cette campagne a déjà été envoyée' }, { status: 409 });
    }

    // Debit ATOMIQUE de la totalite AVANT tout envoi (skip admin). Les courriers non
    // envoyes seront rembourses apres la boucle.
    if (!adminBypass && totalCost > 0) {
      const debit = await query(
        'UPDATE organizations SET credits_balance = credits_balance - $1, credits_used = credits_used + $1, updated_at = now() WHERE id = $2 AND credits_balance >= $1 RETURNING credits_balance',
        [totalCost, orgId]
      );
      if (debit.rows.length === 0) {
        // Liberer le verrou de campagne pose juste avant.
        await query("UPDATE campaigns SET status = 'draft', updated_at = now() WHERE id = $1 AND organization_id = $2", [campaign_id, orgId]);
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${totalCost}, Disponible: ${org.credits_balance}`,
        }, { status: 402 });
      }
    }

    const hasSenderProfile = org.sender_address && org.sender_postal_code && org.sender_city;
    const adresse_expedition: Record<string, string> = hasSenderProfile
      ? {
          ...(org.sender_civilite && { civilite: org.sender_civilite }),
          ...(org.sender_first_name && { prenom: org.sender_first_name }),
          ...(org.sender_last_name && { nom: org.sender_last_name }),
          ...(org.sender_company && { nom_societe: org.sender_company }),
          adresse_ligne1: org.sender_address,
          ...(org.sender_address2 && { adresse_ligne2: org.sender_address2 }),
          code_postal: org.sender_postal_code,
          ville: org.sender_city,
          pays: org.sender_country || 'FRANCE',
        }
      : {
          nom_societe: org.name || 'Proprietaire.net',
          adresse_ligne1: '1 rue de la Paix',
          code_postal: '75001',
          ville: 'PARIS',
          pays: 'FRANCE',
        };

    let sentA = 0;
    let sentB = 0;
    const results: Array<{ recipient_name: string; template: 'A' | 'B'; success: boolean; error?: string }> = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const useA = !hasB || (i / recipients.length) * 100 < splitRatio;
      const template = useA ? campaign.template_a_content : campaign.template_b_content;

      try {
        const vars: Record<string, string> = {
          civilite: recipient.civilite || 'Madame, Monsieur',
          prenom: recipient.prenom || '',
          nom: recipient.nom || '',
          nom_societe: recipient.nom_societe || '',
          adresse_ligne1: recipient.adresse_ligne1 || '',
          code_postal: recipient.code_postal || '',
          ville: recipient.ville || '',
          bien_adresse: recipient.bien_adresse || '',
          expediteur_societe: org.sender_company || org.name || '',
        };

        const finalContent = replaceVariables(template, vars);
        const pdfBase64 = await textToPdfBase64(finalContent);

        const adresse_destination: Record<string, string> = {
          ...(recipient.civilite && { civilite: recipient.civilite }),
          ...(recipient.prenom && { prenom: recipient.prenom }),
          ...(recipient.nom && { nom: recipient.nom }),
          ...(recipient.nom_societe && { nom_societe: recipient.nom_societe }),
          adresse_ligne1: recipient.adresse_ligne1,
          ...(recipient.adresse_ligne2 && { adresse_ligne2: recipient.adresse_ligne2 }),
          code_postal: recipient.code_postal,
          ville: recipient.ville.toUpperCase(),
          pays: recipient.pays || 'France',
        };

        // Envoi REEL via /lettres (et non /lettres/previsualiser qui ne fait qu'une
        // previsualisation): les credits sont debites, les courriers doivent partir.
        const spResponse = await spFetch('/lettres', {
          method: 'POST',
          body: JSON.stringify({
            adresse_expedition,
            adresse_destination,
            fichier: { format: 'pdf', contenu_base64: pdfBase64 },
            type_affranchissement,
            couleur,
            recto_verso,
            placement_adresse: 'insertion_page_adresse',
          }),
        });

        if (spResponse.ok) {
          if (useA) sentA++; else sentB++;
          results.push({ recipient_name: recipient.nom_societe || recipient.nom || '', template: useA ? 'A' : 'B', success: true });
        } else {
          const err = await spResponse.json();
          results.push({ recipient_name: recipient.nom_societe || recipient.nom || '', template: useA ? 'A' : 'B', success: false, error: err.message || 'Erreur SP' });
        }
      } catch (err: any) {
        results.push({ recipient_name: recipient.nom_societe || recipient.nom || '', template: useA ? 'A' : 'B', success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = recipients.length - successCount;

    // Update campaign stats (statut deja 'active' via le claim plus haut).
    await query(
      `UPDATE campaigns SET total_recipients = $1, sent_a = $2, sent_b = $3, updated_at = now() WHERE id = $4`,
      [recipients.length, sentA, sentB, campaign_id]
    );

    // Rembourser les credits des courriers NON partis (debit total fait en amont).
    if (!adminBypass && failedCount > 0) {
      const refund = unitCost * failedCount;
      await query(
        'UPDATE organizations SET credits_balance = credits_balance + $1, credits_used = credits_used - $1, updated_at = now() WHERE id = $2',
        [refund, orgId]
      );
    }

    const creditsUsed = adminBypass ? 0 : unitCost * successCount;
    if (!adminBypass && creditsUsed > 0) {
      await query(
        `INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'usage', $4)`,
        [orgId, auth.user.id, -creditsUsed, `Campagne "${campaign.name}" — ${successCount} courriers`]
      );
      checkAndSendQuotaAlerts(orgId).catch(console.error);
    }

    logAudit(auth, 'campaign.send', 'campaign', campaign_id, { success_count: successCount, total: recipients.length }, getIpFromRequest(req));

    return NextResponse.json({
      success: true,
      sent_a: sentA,
      sent_b: sentB,
      total: recipients.length,
      success_count: successCount,
      results,
    });
  } catch (err: any) {
    console.error('[CAMPAIGN SEND]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
