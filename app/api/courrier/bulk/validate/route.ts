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

    // Calculate total credits needed
    let totalCredits = 0;
    for (const mail of validMails) {
      totalCredits += getCreditCost(mail.type_affranchissement);
    }

    // Check credits (skip for admin)
    const orgResult = await query("SELECT credits_balance FROM organizations WHERE id = $1", [auth.user.organization_id]);
    const org = orgResult.rows[0];

    if (!adminBypass) {
      if (!org || org.credits_balance < totalCredits) {
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${totalCredits}, Disponible: ${org?.credits_balance || 0}`,
        }, { status: 402 });
      }
    }

    // Validate each letter
    const results: Array<{ uid: string; success: boolean; error?: string }> = [];
    let creditsUsed = 0;

    for (const mail of validMails) {
      try {
        const spResponse = await spFetch(`/lettres/${mail.service_postal_uid}/valider`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

        const spResult = await spResponse.json();

        if (!spResponse.ok) {
          results.push({
            uid: mail.service_postal_uid,
            success: false,
            error: spResult.message || spResult.erreur || 'Erreur validation',
          });
          continue;
        }

        const cost = getCreditCost(mail.type_affranchissement);
        if (!adminBypass) {
          creditsUsed += cost;
        }

        // Update mail_history
        await query(
          "UPDATE mail_history SET status = 'sent', credits_used = $1, sent_at = now(), updated_at = now() WHERE service_postal_uid = $2 AND organization_id = $3",
          [adminBypass ? 0 : cost, mail.service_postal_uid, auth.user.organization_id]
        );

        // Auto-create CRM contact
        if (mail.destinataire) {
          await autoCreateContact(auth.user.organization_id!, auth.user.id, mail.destinataire);
        }

        results.push({ uid: mail.service_postal_uid, success: true });
      } catch (err: any) {
        results.push({
          uid: mail.service_postal_uid,
          success: false,
          error: err.message || 'Erreur interne',
        });
      }
    }

    // Deduct credits atomically in one go (skip for admin)
    if (!adminBypass && creditsUsed > 0) {
      const deductResult = await query(
        "UPDATE organizations SET credits_balance = credits_balance - $1, credits_used = credits_used + $1, updated_at = now() WHERE id = $2 AND credits_balance >= $1 RETURNING credits_balance",
        [creditsUsed, auth.user.organization_id]
      );
      if (deductResult.rows.length === 0) {
        return NextResponse.json({
          error: `Crédits insuffisants pour l'envoi groupé.`,
          credits_needed: creditsUsed,
        }, { status: 402 });
      }
      await query(
        "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'usage', $4)",
        [auth.user.organization_id, auth.user.id, -creditsUsed, `Envoi groupé de ${results.filter(r => r.success).length} courriers`]
      );
    }

    const successCount = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      total_validated: successCount,
      total_failed: results.filter(r => !r.success).length,
      credits_used: adminBypass ? 0 : creditsUsed,
      credits_remaining: adminBypass ? 999999 : (org.credits_balance - creditsUsed),
      results,
      message: adminBypass
        ? `${successCount} courrier(s) envoyé(s) (admin — 0 crédit déduit)`
        : `${successCount} courrier(s) envoyé(s) avec succès (${creditsUsed} crédits)`,
    });
  } catch (err: any) {
    console.error("[COURRIER BULK VALIDATE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
