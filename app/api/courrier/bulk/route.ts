import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { textToPdfBase64, replaceVariables } from "@/lib/pdf-generator";
import { spFetch, isConfigured, getCreditCost, generateCsv } from "@/lib/service-postal";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!isConfigured()) return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });

    const body = await req.json();
    const {
      template, // Letter text template with {{variables}}
      recipients, // Array of { civilite, prenom, nom, nom_societe, adresse_ligne1, adresse_ligne2, code_postal, ville, pays, bien_adresse, ... }
      type_affranchissement = "verte",
      couleur = "nb",
      recto_verso = "rectoverso",
      template_id, // optional: ID of saved template used
    } = body;

    if (!template || !template.trim()) {
      return NextResponse.json({ error: "Template de courrier requis" }, { status: 400 });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "Au moins un destinataire requis" }, { status: 400 });
    }

    // Validate all recipients have required address fields
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      if (!r.adresse_ligne1 || !r.code_postal || !r.ville) {
        return NextResponse.json({
          error: `Destinataire #${i + 1} : adresse incomplète (adresse_ligne1, code_postal, ville requis)`,
        }, { status: 400 });
      }
    }

    const adminBypass = isAdminUser(auth);

    // Check credits (skip for admin)
    const creditCost = getCreditCost(type_affranchissement) * recipients.length;
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
          error: `Crédits insuffisants. Besoin: ${creditCost} (${getCreditCost(type_affranchissement)} × ${recipients.length}), Disponible: ${org?.credits_balance || 0}`,
          credits_needed: creditCost,
          credits_available: org?.credits_balance || 0,
        }, { status: 402 });
      }
    }

    // Build sender address: prefer sender_* fields, fallback to org fields
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

    // For each recipient: replace variables in template, generate PDF, call SP
    const results: Array<{ uid: string; recipient_name: string; success: boolean; error?: string }> = [];
    const successUids: string[] = [];

    for (const recipient of recipients) {
      try {
        // Build variable map from recipient data
        const vars: Record<string, string> = {
          civilite: recipient.civilite || 'Madame, Monsieur',
          prenom: recipient.prenom || '',
          nom: recipient.nom || '',
          nom_societe: recipient.nom_societe || '',
          adresse_ligne1: recipient.adresse_ligne1 || '',
          code_postal: recipient.code_postal || '',
          ville: recipient.ville || '',
          bien_adresse: recipient.bien_adresse || '',
          bien_cp: recipient.bien_cp || '',
          bien_ville: recipient.bien_ville || '',
          expediteur_nom: org.sender_company || org.name || '',
          expediteur_societe: org.sender_company || org.name || '',
        };

        // Replace variables and generate PDF
        const finalContent = replaceVariables(template, vars);
        const pdfBase64 = await textToPdfBase64(finalContent);

        const adresse_destination = {
          civilite: recipient.civilite || undefined,
          prenom: recipient.prenom || undefined,
          nom: recipient.nom || undefined,
          nom_societe: recipient.nom_societe || undefined,
          adresse_ligne1: recipient.adresse_ligne1,
          adresse_ligne2: recipient.adresse_ligne2 || undefined,
          code_postal: recipient.code_postal,
          ville: recipient.ville.toUpperCase(),
          pays: recipient.pays || "France",
        };

        // Call Service Postal - preview for validation
        const spResponse = await spFetch('/lettres/previsualiser', {
          method: 'POST',
          body: JSON.stringify({
            adresse_expedition,
            adresse_destination,
            fichier: { format: "pdf", contenu_base64: pdfBase64 },
            type_affranchissement,
            couleur,
            recto_verso,
            placement_adresse: "insertion_page_adresse",
          }),
        });

        const spResult = await spResponse.json();

        if (!spResponse.ok) {
          const recipientName = recipient.nom_societe || `${recipient.prenom || ''} ${recipient.nom || ''}`.trim();
          results.push({
            uid: '',
            recipient_name: recipientName,
            success: false,
            error: spResult.message || spResult.erreur || 'Erreur Service Postal',
          });
          continue;
        }

        const recipientName = recipient.nom_societe || `${recipient.prenom || ''} ${recipient.nom || ''}`.trim();

        // Save in mail_history
        await query(
          `INSERT INTO mail_history (
            user_id, organization_id, service_postal_uid, destinataire,
            type_affranchissement, couleur, status, prix, preview_url, expediteur, template_id
          ) VALUES ($1, $2, $3, $4, $5, $6, 'preview', $7, $8, $9, $10)`,
          [
            auth.user.id,
            auth.user.organization_id,
            spResult.uid,
            JSON.stringify(adresse_destination),
            type_affranchissement,
            couleur,
            spResult.total || 0,
            spResult.fichier_previsualisation?.url || null,
            JSON.stringify(adresse_expedition),
            template_id || null,
          ]
        );

        successUids.push(spResult.uid);
        results.push({
          uid: spResult.uid,
          recipient_name: recipientName,
          success: true,
        });
      } catch (err: any) {
        const recipientName = recipient.nom_societe || `${recipient.prenom || ''} ${recipient.nom || ''}`.trim();
        results.push({
          uid: '',
          recipient_name: recipientName,
          success: false,
          error: err.message || 'Erreur interne',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      total: recipients.length,
      success_count: successCount,
      fail_count: failCount,
      uids: successUids,
      results,
      credit_cost_per_letter: getCreditCost(type_affranchissement),
      total_credit_cost: adminBypass ? 0 : getCreditCost(type_affranchissement) * successCount,
      message: adminBypass
        ? `${successCount}/${recipients.length} courriers prévisualisés (admin — 0 crédit)`
        : `${successCount}/${recipients.length} courriers prévisualisés avec succès`,
    });
  } catch (err: any) {
    console.error("[COURRIER BULK]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
