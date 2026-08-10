/**
 * Validation d'un lot de courriers previsualises.
 *
 * C'EST LE CHEMIN MONETISE REEL DU PRODUIT.
 * /api/courrier/direct et /api/courrier/send sont complets mais appeles par
 * aucun composant de l'interface. Tout l'argent passe ici.
 *
 * CE QUI ETAIT DANGEREUX
 *
 * 1. Le debit et son journal etaient dissocies.
 *    Le solde etait modifie ligne 105, la ligne de credit_transactions n'etait
 *    ecrite qu'a la toute fin, hors transaction, et seulement si le net etait
 *    positif. Une coupure entre les deux laissait des credits debites sans
 *    aucune trace, et le solde cessait d'etre reconstructible.
 *
 * 2. Le remboursement n'ecrivait aucune ligne de journal.
 *    Les consommations et les remboursements ne suivaient pas la meme regle :
 *    c'est precisement ce qui rendait l'invariant
 *    credits_balance = SUM(amount) faux par construction.
 *
 * 3. Aucune idempotence.
 *    Rejouer la requete avec les memes UID debitait une seconde fois.
 *
 * 4. Aucun controle de permission, sur une action payante.
 *
 * NOUVELLE STRUCTURE : UN PLI = UNE UNITE ATOMIQUE
 * Chaque pli est debite avec la reference `courrier:<uid>`, envoye, puis
 * rembourse avec `refund:<uid>` s'il n'est pas parti. L'UID etant unique et
 * validable une seule fois, la reference rend l'operation exactement
 * idempotente et supprime toute comptabilite de remboursement globale.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { authenticateRequest, isAdminUser } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permissions";
import { query, withTransaction, getColonnes } from "@/lib/db";
import { spFetch, isConfigured } from "@/lib/service-postal";
import { marquerStatutPli } from "@/lib/mail-history";
import { calculerTarif, TarificationError, DecompositionTarifaire } from "@/lib/pricing";
import {
  debiterCredits,
  crediterCredits,
  CreditsInsuffisantsError,
  getSolde,
} from "@/lib/credits";
import { requireFeature } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

/** Cree ou met a jour le contact CRM, en ne nommant que des colonnes existantes. */
async function majContactCrm(orgId: string, userId: string, dest: Record<string, unknown>) {
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
    await query(`UPDATE contacts SET ${majs.join(", ")} WHERE id = $1`, [existing.rows[0].id]);
    return;
  }

  // property_address, property_postal_code et property_city font partie des
  // colonnes attendues par le code et absentes de la production : les nommer
  // sans precaution faisait echouer la creation de tout contact, silencieusement.
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
    ["property_address", dest.bien_adresse ?? null],
    ["property_postal_code", dest.bien_cp ?? null],
    ["property_city", dest.bien_ville ?? null],
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

interface ResultatPli {
  uid: string;
  success: boolean;
  credits?: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  const lotId = randomUUID().slice(0, 8);

  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'courrier');
    if (refusPlan) return refusPlan;

    // Action payante : elle exige une permission explicite.
    const refus = await checkPermission(auth, "courrier.bulk");
    if (refus) return refus;

    if (!isConfigured()) {
      return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });
    }

    const orgId = auth.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "Aucune organisation associée" }, { status: 403 });
    }

    const body = await req.json();
    const { uids } = body;

    if (!uids || !Array.isArray(uids) || uids.length === 0) {
      return NextResponse.json({ error: "UIDs requis" }, { status: 400 });
    }
    if (uids.length > 500) {
      return NextResponse.json(
        { error: "Lot trop volumineux (500 plis maximum)" },
        { status: 400 }
      );
    }

    // La clause organization_id est ce qui isole les organisations entre elles :
    // c'est la seule barriere, la base n'ayant aucune Row Level Security.
    const mailResult = await query(
      `SELECT service_postal_uid, type_affranchissement, status, destinataire
         FROM mail_history
        WHERE service_postal_uid = ANY($1) AND organization_id = $2`,
      [uids, orgId]
    );

    const plis = mailResult.rows.filter((m: any) => m.status === "preview");
    if (plis.length === 0) {
      return NextResponse.json({ error: "Aucun courrier à valider" }, { status: 400 });
    }

    const adminBypass = isAdminUser(auth);

    // --- Tarification de chaque pli -----------------------------------------
    const tarifs = new Map<string, DecompositionTarifaire>();
    for (const pli of plis) {
      try {
        tarifs.set(pli.service_postal_uid, calculerTarif(pli.type_affranchissement));
      } catch (err) {
        if (err instanceof TarificationError) {
          return NextResponse.json(
            {
              error: `Pli ${pli.service_postal_uid} : ${err.message}`,
              code: err.code,
            },
            { status: 400 }
          );
        }
        throw err;
      }
    }

    const totalCredits = [...tarifs.values()].reduce((somme, t) => somme + t.credits, 0);

    // --- Controle prealable du solde ----------------------------------------
    // Le debit est ensuite fait pli par pli, mais on refuse le lot entier en
    // amont plutot que d'en envoyer la moitie faute de credits.
    if (!adminBypass) {
      const solde = await getSolde(orgId);
      if (solde < totalCredits) {
        return NextResponse.json(
          {
            error: `Crédits insuffisants. Besoin: ${totalCredits}, disponible: ${solde}`,
            credits_needed: totalCredits,
            credits_available: solde,
          },
          { status: 402 }
        );
      }
    }

    // --- Traitement pli par pli ---------------------------------------------
    const resultats: ResultatPli[] = [];
    const avertissements: string[] = [];
    let creditsConsommes = 0;

    for (const pli of plis) {
      const uid: string = pli.service_postal_uid;
      const tarif = tarifs.get(uid)!;
      let debite = false;

      // 1. Debit, idempotent par UID : revalider le meme pli ne redebite pas.
      if (!adminBypass) {
        try {
          const resultat = await withTransaction((client) =>
            debiterCredits(client, {
              organizationId: orgId,
              userId: auth.user.id,
              montant: tarif.credits,
              type: "usage",
              description: `Courrier ${tarif.type_affranchissement} — ${uid}`,
              reference: `courrier:${uid}`,
              montantEurCentimes: tarif.total_ttc_centimes,
              metadata: {
                uid,
                lot_id: lotId,
                cout_prestataire_ht_centimes: tarif.cout_prestataire_ht_centimes,
                marge_ht_centimes: tarif.marge_ht_centimes,
                tva_centimes: tarif.tva_centimes,
              },
            })
          );
          debite = resultat.applique;
        } catch (err) {
          if (err instanceof CreditsInsuffisantsError) {
            resultats.push({ uid, success: false, error: "Crédits insuffisants" });
            continue;
          }
          throw err;
        }
      }

      // 2. Envoi. Point de non-retour pour ce pli.
      try {
        const spResponse = await spFetch(`/lettres/${uid}/valider`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        const spResult = await spResponse.json().catch(() => ({}));

        if (!spResponse.ok) {
          if (debite) {
            await rembourser(orgId, auth.user.id, tarif.credits, uid, "Refus du prestataire", tarif.total_ttc_centimes);
          }
          // Le pli DOIT quitter l'etat 'preview'. Sans cela il restait
          // selectionnable par une nouvelle validation : la reference
          // d'idempotence `courrier:<uid>` existant deja, aucun debit n'aurait
          // lieu, et le pli serait imprime et poste GRATUITEMENT.
          await sortirDeLaPrevisualisation(uid, orgId);
          resultats.push({
            uid,
            success: false,
            // Le detail brut du prestataire n'est pas relaye au client.
            error: "Le service postal a refusé ce pli",
          });
          console.error(`[COURRIER lot=${lotId}] Refus prestataire uid=${uid}`, spResult);
          continue;
        }
      } catch (err) {
        if (debite) {
          await rembourser(orgId, auth.user.id, tarif.credits, uid, "Echec reseau", tarif.total_ttc_centimes);
        }
        // Meme raison que ci-dessus : ne jamais laisser un pli rembourse
        // revalidable sans debit.
        await sortirDeLaPrevisualisation(uid, orgId);
        resultats.push({ uid, success: false, error: "Service postal injoignable" });
        console.error(`[COURRIER lot=${lotId}] Reseau uid=${uid}`, err);
        continue;
      }

      // 3. Post-envoi, best-effort. Le pli est parti : on ne rembourse plus.
      creditsConsommes += adminBypass ? 0 : tarif.credits;

      try {
        await marquerStatutPli(uid, orgId, 'sent', adminBypass ? 0 : tarif.credits);
      } catch (err) {
        avertissements.push(`Pli ${uid} envoyé mais non enregistré dans l'historique.`);
        console.error(
          `[COURRIER lot=${lotId}] ECHEC HISTORIQUE apres envoi uid=${uid} - rattrapage manuel requis`,
          err
        );
      }

      try {
        if (pli.destinataire) {
          const dest =
            typeof pli.destinataire === "string" ? JSON.parse(pli.destinataire) : pli.destinataire;
          await majContactCrm(orgId, auth.user.id, dest);
        }
      } catch (err) {
        console.error(`[COURRIER lot=${lotId}] CRM uid=${uid}`, err);
      }

      resultats.push({ uid, success: true, credits: adminBypass ? 0 : tarif.credits });
    }

    const succes = resultats.filter((r) => r.success).length;
    const soldeFinal = adminBypass ? null : await getSolde(orgId);

    return NextResponse.json({
      success: succes > 0,
      lot_id: lotId,
      total_validated: succes,
      total_failed: resultats.length - succes,
      credits_used: creditsConsommes,
      credits_remaining: soldeFinal,
      results: resultats,
      avertissements: avertissements.length > 0 ? avertissements : undefined,
      message: adminBypass
        ? `${succes} courrier(s) envoyé(s) (admin, 0 crédit déduit)`
        : `${succes} courrier(s) envoyé(s) (${creditsConsommes} crédits)`,
    });
  } catch (err) {
    console.error(`[COURRIER BULK VALIDATE lot=${lotId}]`, err);
    return NextResponse.json({ error: "Erreur serveur", lot_id: lotId }, { status: 500 });
  }
}

/**
 * Sort un pli de l'etat 'preview' apres un echec.
 * C'est ce qui empeche une revalidation de le poster sans nouveau debit.
 */
async function sortirDeLaPrevisualisation(uid: string, orgId: string): Promise<void> {
  try {
    await marquerStatutPli(uid, orgId, 'refunded', 0);
  } catch (err) {
    console.error(
      `[COURRIER] Pli ${uid} laisse en previsualisation apres echec : ` +
        `il pourrait etre revalide sans debit, verification manuelle requise`,
      err
    );
  }
}

/** Remboursement journalise et idempotent d'un pli non parti. */
async function rembourser(
  orgId: string,
  userId: string,
  credits: number,
  uid: string,
  motif: string,
  montantEurCentimes?: number
): Promise<void> {
  try {
    await withTransaction((client) =>
      crediterCredits(client, {
        organizationId: orgId,
        userId,
        montant: credits,
        type: "refund",
        description: `Remboursement courrier ${uid} : ${motif}`,
        reference: `refund:${uid}`,
        // Signe negatif : un remboursement diminue le chiffre d'affaires.
        montantEurCentimes:
          montantEurCentimes !== undefined ? -Math.abs(montantEurCentimes) : undefined,
        metadata: { uid, motif },
      })
    );
  } catch (err) {
    // Un remboursement impossible est une anomalie comptable : elle doit etre
    // criante dans les logs, jamais avalee.
    console.error(
      `[COURRIER] REMBOURSEMENT IMPOSSIBLE uid=${uid} org=${orgId} credits=${credits}`,
      err
    );
  }
}
