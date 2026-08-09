/**
 * Profil expediteur de l'organisation.
 *
 * C'EST LE SEUL ECRAN QUI PERMET D'AUTORISER UN ENVOI DE COURRIER
 *
 * Le module courrier refuse desormais d'expedier avec une adresse de retour non
 * renseignee : plus de repli sur "1 rue de la Paix, 75001 PARIS", qui etait le
 * cas nominal pour la totalite des organisations et rendait toute lettre
 * recommandee sans valeur juridique.
 *
 * Ce refus n'est tenable que si cette route fonctionne. Or elle nommait
 * directement dix colonnes `sender_*` qui n'existent pas en production : le GET
 * et le PUT levaient tous deux un 42703, le profil ne pouvait donc JAMAIS etre
 * renseigne, et le courrier restait bloque quoi que fasse l'utilisateur.
 *
 * La route ecrit desormais dans les colonnes reellement presentes :
 *   - les colonnes `sender_*` quand la migration les a ajoutees ;
 *   - a defaut, `address`, `postal_code`, `city`, `country` et `name`, qui
 *     existent depuis l'origine et que lib/expediteur sait exploiter.
 *
 * Le profil est ainsi saisissable des maintenant, sans attendre de migration.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permissions";
import { query, getColonnes } from "@/lib/db";
import { erreurServeur } from '@/lib/api-error';
import { resoudreExpediteur, chargerOrganisationPourExpedition } from "@/lib/expediteur";

export const dynamic = "force-dynamic";

/** Champs du formulaire, et colonne de repli quand `sender_*` est absente. */
const CHAMPS: Array<{ champ: string; colonneDediee: string; colonneRepli?: string }> = [
  { champ: 'sender_civilite',    colonneDediee: 'sender_civilite' },
  { champ: 'sender_first_name',  colonneDediee: 'sender_first_name' },
  { champ: 'sender_last_name',   colonneDediee: 'sender_last_name' },
  { champ: 'sender_company',     colonneDediee: 'sender_company',     colonneRepli: 'name' },
  { champ: 'sender_address',     colonneDediee: 'sender_address',     colonneRepli: 'address' },
  { champ: 'sender_address2',    colonneDediee: 'sender_address2' },
  { champ: 'sender_postal_code', colonneDediee: 'sender_postal_code', colonneRepli: 'postal_code' },
  { champ: 'sender_city',        colonneDediee: 'sender_city',        colonneRepli: 'city' },
  { champ: 'sender_country',     colonneDediee: 'sender_country',     colonneRepli: 'country' },
  { champ: 'sender_phone',       colonneDediee: 'sender_phone' },
];

// GET - Récupérer le profil expéditeur de l'organisation
export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const org = await chargerOrganisationPourExpedition(auth.user.organization_id!);
    if (!org) {
      return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 });
    }

    const existantes = await getColonnes('organizations');

    // On renvoie toujours les dix champs attendus par le formulaire, en piochant
    // dans la colonne dediee si elle existe, sinon dans la colonne de repli.
    const sender: Record<string, unknown> = {};
    for (const { champ, colonneDediee, colonneRepli } of CHAMPS) {
      if (existantes.has(colonneDediee) && org[colonneDediee] != null) {
        sender[champ] = org[colonneDediee];
      } else if (colonneRepli && existantes.has(colonneRepli)) {
        sender[champ] = org[colonneRepli] ?? null;
      } else {
        sender[champ] = null;
      }
    }

    const resolution = resoudreExpediteur(org);

    return NextResponse.json({
      sender,
      // L'interface peut ainsi indiquer precisement ce qui manque pour pouvoir
      // envoyer, au lieu de laisser l'utilisateur decouvrir le refus a l'envoi.
      pret_pour_envoi: resolution.ok,
      champs_manquants: resolution.manquants,
      source: resolution.source,
      // True quand les colonnes dediees existent : l'interface peut alors
      // proposer les champs civilite, prenom, nom et telephone.
      profil_dedie_disponible: existantes.has('sender_address'),
    });
  } catch (err: any) {
    return erreurServeur('organization/sender:GET', err);
  }
}

// PUT - Mettre à jour le profil expéditeur
export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    // Seuls owner/admin de l'org ou un role disposant de settings.edit peuvent
    // modifier le profil expediteur.
    const permError = await checkPermission(auth, "settings.edit");
    if (permError) return permError;

    const body = await req.json();
    const existantes = await getColonnes('organizations');

    // Validation avant ecriture : un code postal invalide produirait un pli non
    // distribuable, detecte seulement au retour du courrier.
    const codePostal = String(body.sender_postal_code || '').trim();
    if (codePostal && !/^\d{5}$/.test(codePostal)) {
      return NextResponse.json(
        { error: "Code postal invalide : 5 chiffres attendus" },
        { status: 400 }
      );
    }

    const sets: string[] = [];
    const valeurs: unknown[] = [];
    const ignores: string[] = [];
    let i = 1;

    for (const { champ, colonneDediee, colonneRepli } of CHAMPS) {
      const valeurBrute = body[champ];
      if (valeurBrute === undefined) continue;

      const valeur =
        typeof valeurBrute === 'string' && valeurBrute.trim() === ''
          ? null
          : valeurBrute;

      if (existantes.has(colonneDediee)) {
        sets.push(`${colonneDediee} = $${i++}`);
        valeurs.push(valeur ?? (champ === 'sender_country' ? 'FRANCE' : null));
      } else if (colonneRepli && existantes.has(colonneRepli)) {
        sets.push(`${colonneRepli} = $${i++}`);
        valeurs.push(valeur ?? (champ === 'sender_country' ? 'FRANCE' : null));
      } else {
        // Champ sans colonne d'accueil : on le signale plutot que de laisser
        // croire qu'il a ete enregistre.
        if (valeur != null) ignores.push(champ);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun champ enregistrable. La base ne comporte ni les colonnes " +
            "sender_* ni les colonnes d'adresse de l'organisation.",
          champs_ignores: ignores,
        },
        { status: 422 }
      );
    }

    if (existantes.has('updated_at')) sets.push('updated_at = now()');
    valeurs.push(auth.user.organization_id);

    await query(
      `UPDATE organizations SET ${sets.join(', ')} WHERE id = $${i}`,
      valeurs
    );

    // On reevalue immediatement : l'utilisateur sait s'il peut envoyer.
    const org = await chargerOrganisationPourExpedition(auth.user.organization_id!);
    const resolution = resoudreExpediteur(org);

    return NextResponse.json({
      success: true,
      message: "Profil expéditeur mis à jour",
      pret_pour_envoi: resolution.ok,
      champs_manquants: resolution.manquants,
      champs_ignores: ignores.length > 0 ? ignores : undefined,
      avertissement:
        ignores.length > 0
          ? "Certains champs ne sont pas encore stockables : appliquer la migration du profil expéditeur pour les conserver."
          : undefined,
    });
  } catch (err: any) {
    return erreurServeur('organization/sender:PUT', err);
  }
}
