import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { spFetch, isConfigured, getCreditCost } from "@/lib/service-postal";

export const dynamic = "force-dynamic";

// Auto-create CRM contact from mail destinataire data
async function autoCreateContact(orgId: string, userId: string, dest: any) {
  try {
    // Check if contact already exists (by address match)
    const existing = await query(
      `SELECT id FROM contacts WHERE organization_id = $1 AND (
        (company_name IS NOT NULL AND company_name = $2 AND company_name != '') OR
        (address IS NOT NULL AND address = $3 AND postal_code = $4 AND address != '')
      ) LIMIT 1`,
      [orgId, dest.nom_societe || '', dest.adresse_ligne1 || '', dest.code_postal || '']
    );

    if (existing.rows.length > 0) {
      // Update mail_count
      await query(
        "UPDATE contacts SET mail_count = mail_count + 1, last_contacted_at = now(), updated_at = now() WHERE id = $1",
        [existing.rows[0].id]
      );
      return;
    }

    // Create new contact
    await query(
      `INSERT INTO contacts (
        organization_id, user_id, civilite, first_name, last_name, company_name,
        address, postal_code, city, property_address, property_postal_code, property_city,
        status, mail_count, last_contacted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'contacted',1,now())`,
      [
        orgId, userId,
        dest.civilite || null,
        dest.prenom || null,
        dest.nom || null,
        dest.nom_societe || null,
        dest.adresse_ligne1 || null,
        dest.code_postal || null,
        dest.ville || null,
        dest.bien_adresse || null,
        dest.bien_cp || null,
        dest.bien_ville || null,
      ]
    );
  } catch (err) {
    console.error("[CRM AUTO-CREATE]", err);
    // Non-blocking: don't fail the send
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!isConfigured()) return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });

    const body = await req.json();
    const { uids } = body; // Array of UIDs to validate

    if (!uids || !Array.isArray(uids) || uids.length === 0) {
      return NextResponse.json({ error: "UIDs requis" }, { status: 400 });
    }

    // Verify all UIDs belong to this org and are in preview state
    const mailResult = await query(
      `SELECT service_postal_uid, type_affranchissement, status, destinataire
       FROM mail_history 
       WHERE service_postal_uid = ANY($1) AND organization_id = $2`,
      [uids, auth.user.organization_id]
    );

    const validMails = mailResult.rows.filter((m: any) => m.status === 'preview');
    if (validMails.length === 0) {
      return NextResponse.json({ error: "Aucun courrier à valider" }, { status: 400 });
    }

    const adminBypass = isAdminUser(auth);

    const orgId = auth.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "Aucune organisation associée" }, { status: 400 });
    }

    // Calculate total credits needed
    let totalCredits = 0;
    for (const mail of validMails) {
      totalCredits += getCreditCost(mail.type_affranchissement);
    }

    // Debit ATOMIQUE de la totalite AVANT tout envoi (skip admin): on ne valide jamais
    // un courrier chez Service Postal sans avoir securise les credits (sinon envoi
    // physique gratuit en cas d'echec du debit, ou double-depense concurrente).
    const orgResult = await query("SELECT credits_balance FROM organizations WHERE id = $1", [orgId]);
    const org = orgResult.rows[0];
    if (!org) {
      return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 });
    }

    if (!adminBypass && totalCredits > 0) {
      const debit = await query(
        "UPDATE organizations SET credits_balance = credits_balance - $1, credits_used = credits_used + $1, updated_at = now() WHERE id = $2 AND credits_balance >= $1 RETURNING credits_balance",
        [totalCredits, orgId]
      );
      if (debit.rows.length === 0) {
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${totalCredits}, Disponible: ${org.credits_balance || 0}`,
          credits_needed: totalCredits,
        }, { status: 402 });
      }
    }

    // Validate each letter
    const results: Array<{ uid: string; success: boolean; error?: string }> = [];
    let refundCredits = 0; // credits a rembourser pour les courriers NON partis

    for (const mail of validMails) {
      const cost = getCreditCost(mail.type_affranchissement);
      try {
        const spResponse = await spFetch(`/lettres/${mail.service_postal_uid}/valider`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

        const spResult = await spResponse.json();

        if (!spResponse.ok) {
          if (!adminBypass) refundCredits += cost; // ce courrier n'est pas parti
          results.push({
            uid: mail.service_postal_uid,
            success: false,
            error: spResult.message || spResult.erreur || 'Erreur validation',
          });
          continue;
        }

        // Update mail_history
        await query(
          "UPDATE mail_history SET status = 'sent', credits_used = $1, sent_at = now(), updated_at = now() WHERE service_postal_uid = $2 AND organization_id = $3",
          [adminBypass ? 0 : cost, mail.service_postal_uid, orgId]
        );

        // Auto-create CRM contact (parser le destinataire si stocke en JSON string)
        if (mail.destinataire) {
          const dest = typeof mail.destinataire === 'string' ? JSON.parse(mail.destinataire) : mail.destinataire;
          await autoCreateContact(orgId, auth.user.id, dest);
        }

        results.push({ uid: mail.service_postal_uid, success: true });
      } catch (err: any) {
        if (!adminBypass) refundCredits += cost; // ce courrier n'est pas parti
        results.push({
          uid: mail.service_postal_uid,
          success: false,
          error: err.message || 'Erreur interne',
        });
      }
    }

    // Rembourser les credits des courriers qui n'ont PAS ete envoyes.
    if (!adminBypass && refundCredits > 0) {
      await query(
        "UPDATE organizations SET credits_balance = credits_balance + $1, credits_used = credits_used - $1, updated_at = now() WHERE id = $2",
        [refundCredits, orgId]
      );
    }

    const successCount = results.filter(r => r.success).length;
    const creditsUsed = adminBypass ? 0 : (totalCredits - refundCredits);

    // Tracer la transaction nette (credits reellement consommes).
    if (!adminBypass && creditsUsed > 0) {
      await query(
        "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'usage', $4)",
        [orgId, auth.user.id, -creditsUsed, `Envoi groupé de ${successCount} courriers`]
      );
    }

    return NextResponse.json({
      success: successCount > 0,
      total_validated: successCount,
      total_failed: results.filter(r => !r.success).length,
      credits_used: creditsUsed,
      credits_remaining: adminBypass ? 999999 : Math.max(0, (org.credits_balance || 0) - creditsUsed),
      results,
      message: adminBypass
        ? `${successCount} courrier(s) envoyé(s) (admin, 0 crédit déduit)`
        : `${successCount} courrier(s) envoyé(s) avec succès (${creditsUsed} crédits)`,
    });
  } catch (err: any) {
    console.error("[COURRIER BULK VALIDATE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
