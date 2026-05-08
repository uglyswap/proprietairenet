import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { textToPdfBase64, replaceVariables } from "@/lib/pdf-generator";
import { spFetch, isConfigured } from "@/lib/service-postal";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!isConfigured()) return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });

    const body = await req.json();
    const {
      recipient, // { civilite, prenom, nom, nom_societe, adresse_ligne1, adresse_ligne2, code_postal, ville, pays }
      content, // Text content of the letter (with {{variables}} already replaced OR raw template)
      content_pdf_base64, // OR pre-made PDF as base64
      variables, // Optional: variables to replace in content
      type_affranchissement = "verte",
      couleur = "nb",
      recto_verso = "rectoverso",
    } = body;

    // Validate recipient
    if (!recipient?.adresse_ligne1 || !recipient?.code_postal || !recipient?.ville) {
      return NextResponse.json({ error: "Adresse destinataire incomplète (adresse_ligne1, code_postal, ville requis)" }, { status: 400 });
    }

    // Generate or use PDF
    let pdfBase64: string;
    if (content_pdf_base64) {
      pdfBase64 = content_pdf_base64;
    } else if (content) {
      // Replace variables if provided
      let finalContent = content;
      if (variables && Object.keys(variables).length > 0) {
        finalContent = replaceVariables(content, variables);
      }
      pdfBase64 = await textToPdfBase64(finalContent);
    } else {
      return NextResponse.json({ error: "Contenu du courrier requis (content ou content_pdf_base64)" }, { status: 400 });
    }

    // Build addresses - Use sender profile if available, fallback to org info
    const orgResult = await query(
      `SELECT name, address, city, postal_code, country,
        sender_civilite, sender_first_name, sender_last_name, sender_company,
        sender_address, sender_address2, sender_postal_code, sender_city, sender_country
      FROM organizations WHERE id = $1`,
      [auth.user.organization_id]
    );
    const org = orgResult.rows[0];

    // Build sender address: prefer sender_* fields, fallback to org fields
    const hasSenderProfile = org?.sender_address && org?.sender_postal_code && org?.sender_city;
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
          nom_societe: org?.name || "Proprietaire.net",
          adresse_ligne1: org?.address || "1 rue de la Paix",
          code_postal: org?.postal_code || "75001",
          ville: org?.city || "PARIS",
          pays: org?.country || "France",
        };

    // Remove undefined values
    Object.keys(adresse_expedition).forEach((k) => {
      if (adresse_expedition[k] === undefined) delete adresse_expedition[k];
    });

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

    // Call Service Postal preview
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
      return NextResponse.json({
        error: spResult.message || spResult.erreur || "Erreur Service Postal",
        details: spResult,
      }, { status: spResponse.status });
    }

    // Save in mail_history
    await query(
      `INSERT INTO mail_history (
        user_id, organization_id, service_postal_uid, destinataire,
        type_affranchissement, couleur, status, prix, preview_url, expediteur
      ) VALUES ($1, $2, $3, $4, $5, $6, 'preview', $7, $8, $9)`,
      [
        auth.user.id,
        auth.user.organization_id,
        spResult.uid,
        JSON.stringify(adresse_destination),
        type_affranchissement,
        couleur,
        spResult.total || 0,
        spResult.fichier_previsualisation?.url || spResult.fichier?.url || null,
        JSON.stringify(adresse_expedition),
      ]
    );

    return NextResponse.json({
      success: true,
      uid: spResult.uid,
      prix: { affranchissement: spResult.affranchissement, service: spResult.service, total: spResult.total },
      preview_url: spResult.fichier_previsualisation?.url || null,
    });
  } catch (err: any) {
    console.error("[COURRIER PREVIEW]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
