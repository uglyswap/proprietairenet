import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { textToPdfBase64, replaceVariables } from "@/lib/pdf-generator";
import { spFetch, isConfigured, generateCsv } from "@/lib/service-postal";
import { calculerTarif, TarificationError } from "@/lib/pricing";
import {
  chargerOrganisationPourExpedition,
  resoudreExpediteur,
  messageExpediteurIncomplet,
} from "@/lib/expediteur";
import { erreurServeur } from '@/lib/api-error';

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

    // Tarification : leve sur type inconnu plutot que de facturer au tarif de la
    // lettre verte un affranchissement qui coute trois fois plus cher.
    let tarifUnitaire;
    try {
      tarifUnitaire = calculerTarif(type_affranchissement);
    } catch (err) {
      if (err instanceof TarificationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }
    const creditCost = tarifUnitaire.credits * recipients.length;

    // Le SELECT nommait directement les colonnes sender_*, qui font partie des
    // colonnes attendues par le code et absentes de la production : la requete
    // levait un 42703 et le parcours s'arretait ici. On ne demande desormais
    // que les colonnes reellement presentes.
    const org = await chargerOrganisationPourExpedition(
      auth.user.organization_id!,
      ['credits_balance']
    );

    if (!adminBypass) {
      const soldeCourant = Number(org?.credits_balance ?? 0);
      if (!org || soldeCourant < creditCost) {
        return NextResponse.json({
          error: `Crédits insuffisants. Besoin: ${creditCost} (${tarifUnitaire.credits} × ${recipients.length}), Disponible: ${soldeCourant}`,
          credits_needed: creditCost,
          credits_available: soldeCourant,
        }, { status: 402 });
      }
    }

    // Adresse d'expedition : plus aucune valeur inventee.
    //
    // La cascade precedente se terminait par "1 rue de la Paix, 75001 PARIS".
    // Aucune ligne du code deploye n'ecrivant organizations.address, et aucun
    // ecran ne permettant de la saisir, cette adresse fictive n'etait pas un
    // cas limite : c'etait le cas nominal pour toutes les organisations. Sur
    // une lettre recommandee, le retour expediteur est certain et le pli perd
    // toute valeur juridique.
    const expediteur = resoudreExpediteur(org);
    if (!expediteur.ok || !expediteur.adresse) {
      return NextResponse.json(
        {
          error: messageExpediteurIncomplet(expediteur),
          code: 'EXPEDITEUR_INCOMPLET',
          champs_manquants: expediteur.manquants,
        },
        { status: 422 }
      );
    }
    const adresse_expedition = expediteur.adresse as unknown as Record<string, string | undefined>;

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
          expediteur_nom: adresse_expedition.nom_societe || '',
          expediteur_societe: adresse_expedition.nom_societe || '',
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
      credit_cost_per_letter: tarifUnitaire.credits,
      total_credit_cost: adminBypass ? 0 : tarifUnitaire.credits * successCount,
      // Decomposition rendue visible: cout prestataire, marge, TVA.
      tarification_unitaire: {
        cout_prestataire_ht_centimes: tarifUnitaire.cout_prestataire_ht_centimes,
        marge_ht_centimes: tarifUnitaire.marge_ht_centimes,
        tva_centimes: tarifUnitaire.tva_centimes,
        total_ttc_centimes: tarifUnitaire.total_ttc_centimes,
        marge_pct: tarifUnitaire.marge_pct_effective,
      },
      message: adminBypass
        ? `${successCount}/${recipients.length} courriers prévisualisés (admin — 0 crédit)`
        : `${successCount}/${recipients.length} courriers prévisualisés avec succès`,
    });
  } catch (err: any) {
    console.error("[COURRIER BULK]", err);
    return erreurServeur('courrier/bulk', err);
  }
}
