import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import logger from "@/lib/logger";
import { logAudit, getIpFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";

// Credit costs per affranchissement type
const CREDIT_COSTS: Record<string, number> = {
  verte: 410,
  vertesuivi: 490,
  performance: 520,
  perfsuivi: 600,
  lr: 1080,
  lrar: 1250,
};

// Auto-create CRM contact from mail destinataire data
async function autoCreateContact(orgId: string, userId: string, dest: any) {
  try {
    const existing = await query(
      `SELECT id FROM contacts WHERE organization_id = $1 AND (
        (company_name IS NOT NULL AND company_name = $2 AND company_name != '') OR
        (address IS NOT NULL AND address = $3 AND postal_code = $4 AND address != '')
      ) LIMIT 1`,
      [orgId, dest.nom_societe || '', dest.adresse_ligne1 || '', dest.code_postal || '']
    );

    if (existing.rows.length > 0) {
      await query(
        "UPDATE contacts SET mail_count = mail_count + 1, last_contacted_at = now(), updated_at = now() WHERE id = $1",
        [existing.rows[0].id]
      );
      return;
    }

    await query(
      `INSERT INTO contacts (
        organization_id, user_id, civilite, first_name, last_name, company_name,
        address, postal_code, city,
        status, mail_count, last_contacted_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'contacted',1,now())`,
      [
        orgId, userId,
        dest.civilite || null,
        dest.prenom || null,
        dest.nom || null,
        dest.nom_societe || null,
        dest.adresse_ligne1 || null,
        dest.code_postal || null,
        dest.ville || null,
      ]
    );
  } catch (err) {
    logger.error('CRM', 'Auto-create contact error', { error: (err as any).message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    if (!SP_API_KEY) {
      return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });
    }

    const body = await req.json();
    const { uid } = body;

    if (!uid) {
      return NextResponse.json({ error: "UID du courrier requis" }, { status: 400 });
    }

    // Check that this mail belongs to the org and is in preview state
    const mailResult = await query(
      "SELECT * FROM mail_history WHERE service_postal_uid = $1 AND organization_id = $2",
      [uid, auth.user.organization_id]
    );

    if (mailResult.rows.length === 0) {
      return NextResponse.json({ error: "Courrier non trouvé" }, { status: 404 });
    }

    const mail = mailResult.rows[0];

    if (mail.status !== 'preview') {
      return NextResponse.json({ error: `Courrier déjà traité (statut: ${mail.status})` }, { status: 400 });
    }

    const creditCost = CREDIT_COSTS[mail.type_affranchissement] || 410;
    const adminBypass = isAdminUser(auth);

    // Check credits (skip for admin)
    if (!adminBypass) {
      const orgResult = await query("SELECT credits_balance FROM organizations WHERE id = $1", [auth.user.organization_id]);
      const org = orgResult.rows[0];

      if (!org || org.credits_balance < creditCost) {
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${creditCost}, Disponible: ${org?.credits_balance || 0}`,
          credits_needed: creditCost,
          credits_available: org?.credits_balance || 0,
        }, { status: 402 });
      }
    }

    // Call Service Postal validate endpoint
    const spResponse = await fetch(`${SP_API_URL}/lettres/${uid}/valider`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiKey": SP_API_KEY,
      },
      body: JSON.stringify({}),
    });

    const spResult = await spResponse.json();

    if (!spResponse.ok) {
      logger.error('COURRIER', 'Service Postal error', { uid, error: spResult });
      return NextResponse.json({
        error: spResult.message || spResult.erreur || "Erreur du service postal",
        details: spResult,
      }, { status: spResponse.status });
    }

    // Deduct credits atomically (skip for admin)
    if (!adminBypass) {
      const deductResult = await query(
        "UPDATE organizations SET credits_balance = credits_balance - $1, credits_used = credits_used + $1, updated_at = now() WHERE id = $2 AND credits_balance >= $1 RETURNING credits_balance",
        [creditCost, auth.user.organization_id]
      );
      if (deductResult.rows.length === 0) {
        // Credit deduction failed — balance insufficient (race condition protection)
        return NextResponse.json({
          error: `Crédits insuffisants.`,
          credits_needed: creditCost,
        }, { status: 402 });
      }
      await query(
        "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'usage', $4)",
        [auth.user.organization_id, auth.user.id, -creditCost, `Courrier postal ${mail.type_affranchissement} — ${uid}`]
      );
    }

    // Update mail_history
    await query(
      "UPDATE mail_history SET status = 'sent', credits_used = $1, sent_at = now(), updated_at = now() WHERE service_postal_uid = $2 AND organization_id = $3",
      [adminBypass ? 0 : creditCost, uid, auth.user.organization_id]
    );

    // Auto-create CRM contact
    if (mail.destinataire) {
      const dest = typeof mail.destinataire === 'string' ? JSON.parse(mail.destinataire) : mail.destinataire;
      await autoCreateContact(auth.user.organization_id!, auth.user.id, dest);
    }

    // Create notification for courrier sent
    const recipientName = mail.recipient_name || 'destinataire';
    await createNotification(
      auth.user.organization_id!,
      auth.user.id,
      'courrier_sent',
      'Courrier envoyé',
      `Courrier envoyé à ${recipientName} (${creditCost} crédits)`,
      '/dashboard/courrier'
    );

    // Check if credits are low (< 20%)
    const orgBalanceResult = await query("SELECT credits_balance, credits_used FROM organizations WHERE id = $1", [auth.user.organization_id]);
    const orgBalance = orgBalanceResult.rows[0];
    if (orgBalance) {
      const totalCredits = orgBalance.credits_balance + orgBalance.credits_used;
      if (totalCredits > 0 && orgBalance.credits_balance / totalCredits < 0.2) {
        await createNotification(
          auth.user.organization_id!,
          auth.user.id,
          'credit_low',
          'Crédits bas',
          `Il ne vous reste que ${orgBalance.credits_balance} crédits. Pensez à en acheter !`,
          '/pricing'
        );
      }
    }

    logger.info('COURRIER', 'Mail sent successfully', { uid, creditCost, orgId: auth.user.organization_id });

    return NextResponse.json({
      success: true,
      uid,
      credits_used: adminBypass ? 0 : creditCost,
      credits_remaining: adminBypass ? 999999 : (orgBalance?.credits_balance || 0),
      message: adminBypass
        ? `Courrier validé et envoyé avec succès (admin — 0 crédit déduit)`
        : `Courrier validé et envoyé avec succès (${creditCost} crédits)`,
    });
  } catch (err: any) {
    logger.error('COURRIER', 'Send error', { error: err.message });
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
