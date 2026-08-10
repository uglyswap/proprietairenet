/**
 * Envoi d'un courrier unitaire.
 *
 * LA SEQUENCE ETAIT UNE BOMBE, ELLE EST DESORMAIS ORDONNEE
 *
 * Ancienne sequence, et ce qu'elle produisait une fois les colonnes ajoutees :
 *   :89  SELECT des colonnes sender_* -> echouait AVANT tout, donc inoffensif
 *   :105 debit atomique des credits
 *   :166 appel Service Postal        -> le courrier est imprime et poste
 *   :194 mailSent = true
 *   :205 INSERT mail_history         -> levait TOUJOURS (recipient NOT NULL)
 *   :243 if (refund && !mailSent)    -> faux, donc AUCUN remboursement
 *
 * Ajouter les colonnes sender_* sans corriger mail_history deplacait le point
 * de rupture APRES le debit et APRES la mise a la poste : credits debites,
 * courrier physiquement parti, erreur 500 a l'ecran invitant l'utilisateur a
 * recliquer donc a poster un second pli facture, et aucune trace en base.
 *
 * La sequence est maintenant decoupee en trois phases explicites :
 *
 *   PHASE 1 - PRE-ENVOI, transactionnelle et entierement annulable.
 *             Validation, tarification, resolution de l'expediteur, debit.
 *             Tout echec ici n'a aucune consequence : rien n'est parti.
 *
 *   PHASE 2 - ENVOI. Point de non-retour unique et identifie.
 *             Un echec ici rembourse integralement.
 *
 *   PHASE 3 - POST-ENVOI, best-effort. Historique, CRM, correlation.
 *             Un echec ici ne rembourse JAMAIS et ne fait JAMAIS echouer la
 *             reponse : le courrier est parti, l'argent est du. Les echecs
 *             sont remontes en avertissements et journalises pour rattrapage.
 *
 * Le debit ecrit sa ligne de journal dans la meme transaction : meme si toute
 * la phase 3 echoue, le mouvement d'argent reste trace.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permissions";
import { query, withTransaction, getColonnes } from "@/lib/db";
import { calculerTarif, TarificationError, DecompositionTarifaire } from "@/lib/pricing";
import {
  chargerOrganisationPourExpedition,
  resoudreExpediteur,
  messageExpediteurIncomplet,
  validerDestinataire,
  AdresseExpedition,
} from "@/lib/expediteur";
import {
  debiterCredits,
  crediterCredits,
  CreditsInsuffisantsError,
} from "@/lib/credits";
import { requireFeature } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";
const SP_TIMEOUT_MS = 60000;

/**
 * Enregistre le pli dans l'historique.
 * L'insert ne nomme que des colonnes reellement presentes : `couleur`,
 * `recto_verso` et `expediteur` sont attendues par le code et absentes de la
 * production, et `recipient` est NOT NULL sans jamais avoir ete fournie.
 */
async function enregistrerHistorique(params: {
  userId: string;
  organizationId: string;
  uid: string;
  destinataire: Record<string, unknown>;
  expediteur: AdresseExpedition;
  typeAffranchissement: string;
  couleur: string;
  rectoVerso: string;
  prix: number;
  creditsUtilises: number;
}): Promise<void> {
  const existantes = await getColonnes("mail_history");

  const libelleDestinataire =
    [params.destinataire.nom_societe, params.destinataire.prenom, params.destinataire.nom]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    String(params.destinataire.adresse_ligne1 || "Destinataire inconnu");

  const candidats: Array<[string, unknown]> = [
    ["user_id", params.userId],
    ["organization_id", params.organizationId],
    // recipient est NOT NULL : c'est l'omission qui faisait echouer l'insert.
    ["recipient", libelleDestinataire],
    ["recipient_name", libelleDestinataire],
    ["service_postal_uid", params.uid],
    ["destinataire", JSON.stringify(params.destinataire)],
    ["type_affranchissement", params.typeAffranchissement],
    ["couleur", params.couleur],
    ["recto_verso", params.rectoVerso],
    ["expediteur", JSON.stringify(params.expediteur)],
    ["status", "sent"],
    ["prix", params.prix],
    ["credits_used", params.creditsUtilises],
    ["sent_at", new Date()],
  ];

  const retenus = candidats.filter(([colonne]) => existantes.has(colonne));
  const colonnes = retenus.map(([c]) => c);
  const valeurs = retenus.map(([, v]) => v);
  const placeholders = valeurs.map((_, i) => `$${i + 1}`).join(", ");

  await query(
    `INSERT INTO mail_history (${colonnes.join(", ")}) VALUES (${placeholders})`,
    valeurs
  );
}

/** Cree ou met a jour le contact CRM correspondant au destinataire. */
async function majContactCrm(
  orgId: string,
  userId: string,
  dest: Record<string, unknown>
): Promise<void> {
  const existantes = await getColonnes("contacts");

  const existing = await query(
    `SELECT id FROM contacts
      WHERE organization_id = $1
        AND (
          (company_name IS NOT NULL AND company_name <> '' AND company_name = $2)
          OR (address IS NOT NULL AND address <> '' AND address = $3 AND postal_code = $4)
        )
      LIMIT 1`,
    [orgId, dest.nom_societe || "", dest.adresse_ligne1 || "", dest.code_postal || ""]
  );

  if (existing.rows.length > 0) {
    // contacts n'a PAS de colonne updated_at en production : la nommer en dur
    // faisait echouer chaque mise a jour de contact existant.
    const majs: string[] = [];
    if (existantes.has("updated_at")) majs.push("updated_at = now()");
    if (existantes.has("mail_count")) majs.push("mail_count = COALESCE(mail_count, 0) + 1");
    if (existantes.has("last_contacted_at")) majs.push("last_contacted_at = now()");
    if (majs.length === 0) return;
    await query(`UPDATE contacts SET ${majs.join(", ")} WHERE id = $1`, [
      existing.rows[0].id,
    ]);
    return;
  }

  const candidats: Array<[string, unknown]> = [
    ["organization_id", orgId],
    ["user_id", userId],
    ["civilite", dest.civilite ?? null],
    ["first_name", dest.prenom ?? null],
    ["last_name", dest.nom ?? null],
    ["company_name", dest.nom_societe ?? null],
    ["address", dest.adresse_ligne1 ?? null],
    ["postal_code", dest.code_postal ?? null],
    ["city", dest.ville ?? null],
    ["status", "contacted"],
    ["mail_count", 1],
    ["last_contacted_at", new Date()],
  ];

  const retenus = candidats.filter(([colonne]) => existantes.has(colonne));
  const placeholders = retenus.map((_, i) => `$${i + 1}`).join(", ");

  await query(
    `INSERT INTO contacts (${retenus.map(([c]) => c).join(", ")}) VALUES (${placeholders})`,
    retenus.map(([, v]) => v)
  );
}

export async function POST(req: NextRequest) {
  // Identifiant d'envoi.
  //
  // Genere ici, il change a chaque requete : la reference `courrier:<envoiId>`
  // ne protegeait donc de rien. Un client qui relance sa requete apres un
  // timeout obtenait un second debit ET un second pli reellement poste.
  //
  // L'appelant peut desormais fournir sa propre cle via l'en-tete
  // Idempotency-Key ou le champ `idempotency_key` du corps. Deux tentatives
  // portant la meme cle ne produisent alors qu'un seul debit.
  const cleEnteteIdempotence = req.headers.get('idempotency-key');
  const avertissements: string[] = [];

  try {
    // =======================================================================
    // PHASE 1 - PRE-ENVOI (entierement annulable, rien n'est parti)
    // =======================================================================
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'courrier');
    if (refusPlan) return refusPlan;

    // Les 10 routes de courrier ne verifiaient AUCUNE permission, alors que
    // `courrier.send` existe : un role viewer pouvait declencher des envois
    // payants sur le compte de son organisation.
    const refus = await checkPermission(auth, "courrier.send");
    if (refus) return refus;

    if (!SP_API_KEY) {
      return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });
    }

    const body = await req.json();
    const envoiId =
      cleEnteteIdempotence?.trim() ||
      (typeof body?.idempotency_key === 'string' && body.idempotency_key.trim()) ||
      randomUUID();
    const {
      adresse_destination,
      fichier,
      type_affranchissement = "verte",
      couleur = "nb",
      recto_verso = "rectoverso",
      placement_adresse = "insertion_page_adresse",
      variables,
    } = body;

    const destinataireCheck = validerDestinataire(adresse_destination);
    if (!destinataireCheck.ok) {
      return NextResponse.json(
        {
          error: "Adresse destinataire incomplète",
          champs_manquants: destinataireCheck.manquants,
        },
        { status: 400 }
      );
    }

    if (!fichier || !fichier.contenu_base64 || !fichier.format) {
      return NextResponse.json(
        { error: "Fichier requis (format + contenu_base64)" },
        { status: 400 }
      );
    }

    // Tarification : leve sur type inconnu ou marge insuffisante, au lieu de
    // retomber silencieusement sur le tarif de la lettre verte.
    let tarif: DecompositionTarifaire;
    try {
      tarif = calculerTarif(type_affranchissement);
    } catch (err) {
      if (err instanceof TarificationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
      }
      throw err;
    }

    const organizationId = auth.user.organization_id;
    if (!organizationId) {
      return NextResponse.json({ error: "Aucune organisation associée" }, { status: 403 });
    }

    const org = await chargerOrganisationPourExpedition(organizationId, ["credits_balance"]);
    const expediteur = resoudreExpediteur(org);
    if (!expediteur.ok || !expediteur.adresse) {
      // Garde-fou non negociable : jamais d'adresse de retour inventee.
      return NextResponse.json(
        {
          error: messageExpediteurIncomplet(expediteur),
          code: "EXPEDITEUR_INCOMPLET",
          champs_manquants: expediteur.manquants,
        },
        { status: 422 }
      );
    }

    const adminBypass = isAdminUser(auth);
    let soldeApres = Number(org?.credits_balance ?? 0);

    if (!adminBypass) {
      try {
        const resultat = await withTransaction((client) =>
          debiterCredits(client, {
            organizationId,
            userId: auth.user.id,
            montant: tarif.credits,
            type: "usage",
            description: `Courrier ${tarif.type_affranchissement} (envoi ${envoiId})`,
            reference: `courrier:${envoiId}`,
            montantEurCentimes: tarif.total_ttc_centimes,
            metadata: {
              envoi_id: envoiId,
              cout_prestataire_ht_centimes: tarif.cout_prestataire_ht_centimes,
              marge_ht_centimes: tarif.marge_ht_centimes,
              tva_centimes: tarif.tva_centimes,
            },
          })
        );
        soldeApres = resultat.soldeApres;
      } catch (err) {
        if (err instanceof CreditsInsuffisantsError) {
          return NextResponse.json(
            {
              error: err.message,
              credits_needed: err.requis,
              credits_available: err.disponible,
            },
            { status: 402 }
          );
        }
        throw err;
      }
    }

    // =======================================================================
    // PHASE 2 - ENVOI (point de non-retour)
    // =======================================================================
    if (!adresse_destination.pays) adresse_destination.pays = "France";

    const spPayload: Record<string, unknown> = {
      adresse_expedition: expediteur.adresse,
      adresse_destination,
      fichier,
      type_affranchissement: tarif.type_affranchissement,
      couleur,
      recto_verso,
      placement_adresse,
    };
    if (variables && Object.keys(variables).length > 0) {
      spPayload.variables = variables;
    }

    let spResult: Record<string, unknown>;
    let spOk = false;
    let spStatus = 502;

    try {
      const spResponse = await fetch(`${SP_API_URL}/lettres`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apiKey: SP_API_KEY },
        body: JSON.stringify(spPayload),
        signal: AbortSignal.timeout(SP_TIMEOUT_MS),
      });
      spStatus = spResponse.status;
      spResult = await spResponse.json().catch(() => ({}));
      spOk = spResponse.ok;
    } catch (err) {
      // Timeout ou reseau : on NE PEUT PAS savoir si le pli est parti.
      // On rembourse et on le dit explicitement, plutot que de laisser
      // l'utilisateur face a un debit sans reponse.
      if (!adminBypass) {
        await rembourser(organizationId, auth.user.id, tarif.credits, envoiId,
          "Echec reseau vers le prestataire", tarif.total_ttc_centimes).catch((e) =>
          console.error(`[COURRIER ${envoiId}] Remboursement impossible`, e)
        );
      }
      console.error(`[COURRIER ${envoiId}] Appel Service Postal en echec`, err);
      return NextResponse.json(
        {
          error:
            "Le service postal n'a pas repondu. Vos credits ont ete rembourses. " +
            "Si un pli avait malgre tout ete accepte, il apparaitra dans votre historique.",
          code: "PRESTATAIRE_INJOIGNABLE",
          envoi_id: envoiId,
        },
        { status: 504 }
      );
    }

    if (!spOk) {
      if (!adminBypass) {
        await rembourser(organizationId, auth.user.id, tarif.credits, envoiId,
          "Refus du prestataire", tarif.total_ttc_centimes).catch((e) =>
          console.error(`[COURRIER ${envoiId}] Remboursement impossible`, e)
        );
      }
      console.error(`[COURRIER ${envoiId}] Service Postal a refuse`, spResult);
      return NextResponse.json(
        {
          // Le detail brut du prestataire n'est pas relaye tel quel.
          error: "Le service postal a refusé l'envoi. Vos crédits ont été remboursés.",
          code: "PRESTATAIRE_REFUS",
          envoi_id: envoiId,
        },
        { status: spStatus >= 400 && spStatus < 500 ? 422 : 502 }
      );
    }

    const uid = String(spResult.uid ?? "");

    // =======================================================================
    // PHASE 3 - POST-ENVOI (best-effort, ne rembourse jamais)
    // =======================================================================
    try {
      await enregistrerHistorique({
        userId: auth.user.id,
        organizationId,
        uid,
        destinataire: adresse_destination,
        expediteur: expediteur.adresse,
        typeAffranchissement: tarif.type_affranchissement,
        couleur,
        rectoVerso: recto_verso,
        prix: Number(spResult.total ?? 0),
        creditsUtilises: adminBypass ? 0 : tarif.credits,
      });
    } catch (err) {
      // Le courrier EST parti. On ne rembourse pas, on signale.
      avertissements.push(
        "Le courrier a été envoyé mais n'a pas pu être enregistré dans l'historique."
      );
      console.error(
        `[COURRIER ${envoiId}] ECHEC HISTORIQUE apres envoi reussi uid=${uid} ` +
          `org=${organizationId} credits=${tarif.credits} - rattrapage manuel requis`,
        err
      );
    }

    // Correlation du mouvement de credits avec l'identifiant prestataire.
    if (!adminBypass && uid) {
      try {
        await query(
          `UPDATE credit_transactions
              SET description = $1
            WHERE organization_id = $2
              AND description LIKE $3`,
          [
            `Courrier ${tarif.type_affranchissement} — ${uid}`,
            organizationId,
            `%${envoiId}%`,
          ]
        );
      } catch (err) {
        console.error(`[COURRIER ${envoiId}] Correlation uid impossible`, err);
      }
    }

    try {
      await majContactCrm(organizationId, auth.user.id, adresse_destination);
    } catch (err) {
      avertissements.push("Le contact CRM n'a pas pu être mis à jour.");
      console.error(`[COURRIER ${envoiId}] CRM`, err);
    }

    return NextResponse.json({
      success: true,
      uid,
      envoi_id: envoiId,
      prix: {
        affranchissement: spResult.affranchissement ?? null,
        service: spResult.service ?? null,
        total: spResult.total ?? null,
      },
      // Decomposition tarifaire explicite : ce que paie le client, ce que coute
      // le prestataire, ce que gagne l'entreprise.
      tarification: {
        credits: tarif.credits,
        cout_prestataire_ht_centimes: tarif.cout_prestataire_ht_centimes,
        marge_ht_centimes: tarif.marge_ht_centimes,
        tva_centimes: tarif.tva_centimes,
        total_ttc_centimes: tarif.total_ttc_centimes,
        marge_pct: tarif.marge_pct_effective,
      },
      credits_used: adminBypass ? 0 : tarif.credits,
      credits_remaining: soldeApres,
      expediteur_source: expediteur.source,
      avertissements: avertissements.length > 0 ? avertissements : undefined,
      message: adminBypass
        ? "Courrier envoyé (admin, 0 crédit déduit)"
        : `Courrier envoyé (${tarif.credits} crédits)`,
    });
  } catch (err) {
    // Toute exception non rattrapee arrive ici AVANT l'envoi : les phases 2 et 3
    // gerent elles-memes leurs echecs. Aucun remboursement a faire ici.
    const reference = cleEnteteIdempotence || 'sans-cle';
    console.error(`[COURRIER ${reference}]`, err);
    return NextResponse.json(
      { error: "Erreur serveur", envoi_id: reference },
      { status: 500 }
    );
  }
}

/** Remboursement integral, journalise, idempotent par reference. */
async function rembourser(
  organizationId: string,
  userId: string,
  credits: number,
  envoiId: string,
  motif: string,
  montantEurCentimes?: number
): Promise<void> {
  await withTransaction((client) =>
    crediterCredits(client, {
      organizationId,
      userId,
      montant: credits,
      type: "refund",
      description: `Remboursement courrier (envoi ${envoiId}) : ${motif}`,
      reference: `refund:${envoiId}`,
      // Signe negatif : un remboursement DIMINUE le chiffre d'affaires. Sans ce
      // montant, la vue de revenus comptait le pli comme encaisse alors qu'il
      // avait ete rembourse.
      montantEurCentimes:
        montantEurCentimes !== undefined ? -Math.abs(montantEurCentimes) : undefined,
      metadata: { envoi_id: envoiId, motif },
    })
  );
}
