import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";

// Credit costs per affranchissement type
const CREDIT_COSTS: Record<string, number> = {
  ecopli: 2,
  verte: 3,
  vertesuivi: 4,
  performance: 3,
  perfsuivi: 4,
  lr: 5,
  lrar: 6,
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
    console.error("[CRM AUTO-CREATE DIRECT]", err);
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
    const {
      adresse_destination,
      fichier,
      type_affranchissement = "verte",
      couleur = "nb",
      recto_verso = "rectoverso",
      placement_adresse = "insertion_page_adresse",
      variables,
    } = body;

    // Validate
    if (!adresse_destination || !adresse_destination.adresse_ligne1 || !adresse_destination.code_postal || !adresse_destination.ville) {
      return NextResponse.json({ error: "Adresse destinataire incomplète" }, { status: 400 });
    }

    if (!fichier || !fichier.contenu_base64 || !fichier.format) {
      return NextResponse.json({ error: "Fichier requis (format + contenu_base64)" }, { status: 400 });
    }

    const creditCost = CREDIT_COSTS[type_affranchissement] || 3;
    const adminBypass = isAdminUser(auth);

    // Check credits (skip for admin)
    const orgResult = await query(
      `SELECT credits_balance, name, address, city, postal_code, country,
        sender_civilite, sender_first_name, sender_last_name, sender_company,
        sender_address, sender_address2, sender_postal_code, sender_city, sender_country
      FROM organizations WHERE id = $1`,
      [auth.user.organization_id]
    );
    const org = orgResult.rows[0];

    if (!adminBypass) {
      if (!org || org.credits_balance < creditCost) {
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${creditCost}, Disponible: ${org?.credits_balance || 0}`,
          credits_needed: creditCost,
          credits_available: org?.credits_balance || 0,
        }, { status: 402 });
      }
    }

    // Build expedition address from sender profile (preferred) or org fields (fallback)
    const hasSenderProfile = org.sender_address && org.sender_postal_code && org.sender_city;
    const adresse_expedition: Record<string, string | undefined> = hasSenderProfile
      ? {
          civilite: org.sender_civilite || undefined,
          prenom: org.sender_first_name || undefined,
          nom: org.sender_last_name || undefined,
          nom_societe: org.sender_company || undefined,
          adresse_ligne1: org.sender_address,
          adresse_ligne2: org.sender_address2 || undefined,
          code_postal: org.sender_postal_code,
          ville: org.sender_city,
          pays: org.sender_country || "FRANCE",
        }
      : {
          nom_societe: org.name || "Proprietaire.net",
          adresse_ligne1: org.address || "1 rue de la Paix",
          code_postal: org.postal_code || "75001",
          ville: org.city || "PARIS",
          pays: org.country || "France",
        };

    // Remove undefined values
    Object.keys(adresse_expedition).forEach((k) => {
      if (adresse_expedition[k] === undefined) delete adresse_expedition[k];
    });

    if (!adresse_destination.pays) {
      adresse_destination.pays = "France";
    }

    // Build payload
    const spPayload: any = {
      adresse_expedition,
      adresse_destination,
      fichier,
      type_affranchissement,
      couleur,
      recto_verso,
      placement_adresse,
    };

    if (variables && Object.keys(variables).length > 0) {
      spPayload.variables = variables;
    }

    // Call Service Postal direct send
    const spResponse = await fetch(`${SP_API_URL}/lettres`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apiKey": SP_API_KEY,
      },
      body: JSON.stringify(spPayload),
    });

    const spResult = await spResponse.json();

    if (!spResponse.ok) {
      console.error("[COURRIER DIRECT] Service Postal error:", spResult);
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
        return NextResponse.json({
          error: `Crédits insuffisants.`,
          credits_needed: creditCost,
        }, { status: 402 });
      }
      await query(
        "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'usage', $4)",
        [auth.user.organization_id, auth.user.id, -creditCost, `Courrier direct ${type_affranchissement} — ${spResult.uid}`]
      );
    }

    // Save in mail_history
    await query(
      `INSERT INTO mail_history (
        user_id, organization_id, service_postal_uid, destinataire,
        type_affranchissement, couleur, recto_verso, status, prix, credits_used, sent_at, expediteur
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'sent', $8, $9, now(), $10)`,
      [
        auth.user.id,
        auth.user.organization_id,
        spResult.uid,
        JSON.stringify(adresse_destination),
        type_affranchissement,
        couleur,
        recto_verso,
        spResult.total || 0,
        adminBypass ? 0 : creditCost,
        JSON.stringify(adresse_expedition),
      ]
    );

    // Auto-create CRM contact
    await autoCreateContact(auth.user.organization_id!, auth.user.id, adresse_destination);

    return NextResponse.json({
      success: true,
      uid: spResult.uid,
      prix: {
        affranchissement: spResult.affranchissement,
        service: spResult.service,
        total: spResult.total,
      },
      credits_used: adminBypass ? 0 : creditCost,
      credits_remaining: adminBypass ? 999999 : (org.credits_balance - creditCost),
      message: adminBypass
        ? `Courrier envoyé avec succès (admin — 0 crédit déduit)`
        : `Courrier envoyé avec succès (${creditCost} crédits)`,
    });
  } catch (err: any) {
    console.error("[COURRIER DIRECT]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
