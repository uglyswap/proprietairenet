/**
 * Profil expediteur du courrier postal.
 *
 * POURQUOI CE MODULE REFUSE PLUTOT QUE DE COMPLETER
 *
 * Le code precedent construisait l'adresse d'expedition avec une cascade de
 * valeurs par defaut se terminant par :
 *
 *     adresse_ligne1: org.address || "1 rue de la Paix"
 *     code_postal:    org.postal_code || "75001"
 *     ville:          org.city || "PARIS"
 *
 * Or aucune ligne du code deploye n'ecrit `organizations.address`, et aucun
 * ecran ne permet de la saisir. Cette adresse fictive n'etait donc pas un cas
 * limite : c'etait le cas NOMINAL, pour la totalite des organisations.
 *
 * Les consequences ne sont pas cosmetiques. Sur une lettre recommandee avec
 * accuse de reception facturee 12,50 EUR, le retour expediteur est certain et
 * le recommande perd toute valeur juridique. Un courrier commercial portant une
 * adresse d'expediteur fictive est par ailleurs difficilement defendable au
 * regard de l'obligation d'identification de l'annonceur.
 *
 * Ce module refuse donc l'envoi tant que l'expediteur n'est pas reellement
 * renseigne. C'est un des deux garde-fous a deployer AVANT toute migration qui
 * debloquerait le module courrier.
 */

import { query, getColonnes } from './db';

export interface AdresseExpedition {
  civilite?: string;
  prenom?: string;
  nom?: string;
  nom_societe?: string;
  adresse_ligne1: string;
  adresse_ligne2?: string;
  code_postal: string;
  ville: string;
  pays: string;
}

export interface ResolutionExpediteur {
  ok: boolean;
  adresse?: AdresseExpedition;
  /** Champs manquants, pour un message d'erreur actionnable. */
  manquants: string[];
  /** Origine du profil retenu, pour le journal. */
  source: 'profil_expediteur' | 'adresse_organisation' | 'aucune';
}

/** Un code postal francais valide : 5 chiffres. */
function codePostalValide(valeur: unknown): boolean {
  return typeof valeur === 'string' && /^\d{5}$/.test(valeur.trim());
}

function nonVide(valeur: unknown): boolean {
  return typeof valeur === 'string' && valeur.trim().length > 0;
}

/**
 * Colonnes du profil expediteur. Elles font partie des colonnes attendues par
 * le code et absentes de la production : on ne les selectionne que si elles
 * existent, sinon la requete entiere echoue en 42703.
 */
const COLONNES_EXPEDITEUR = [
  'sender_civilite',
  'sender_first_name',
  'sender_last_name',
  'sender_company',
  'sender_address',
  'sender_address2',
  'sender_postal_code',
  'sender_city',
  'sender_country',
];

const COLONNES_ORGANISATION = ['name', 'address', 'city', 'postal_code', 'country'];

export interface OrganisationExpedition {
  [key: string]: unknown;
}

/**
 * Charge les colonnes d'organisation utiles a l'expedition, en ne demandant que
 * celles qui existent reellement.
 */
export async function chargerOrganisationPourExpedition(
  organizationId: string,
  colonnesSupplementaires: string[] = []
): Promise<OrganisationExpedition | null> {
  const existantes = await getColonnes('organizations');
  const souhaitees = [
    'id',
    ...COLONNES_ORGANISATION,
    ...COLONNES_EXPEDITEUR,
    ...colonnesSupplementaires,
  ];
  const retenues = souhaitees.filter((c) => existantes.has(c));

  if (retenues.length === 0) return null;

  const result = await query(
    `SELECT ${retenues.join(', ')} FROM organizations WHERE id = $1`,
    [organizationId]
  );
  return result.rows[0] ?? null;
}

/**
 * Resout l'adresse d'expedition d'une organisation.
 *
 * Deux sources sont acceptees, dans cet ordre :
 *   1. le profil expediteur dedie (`sender_*`), quand les colonnes existent ;
 *   2. l'adresse de l'organisation (`address`, `postal_code`, `city`).
 *
 * Aucune valeur par defaut n'est inventee. Si aucune des deux sources n'est
 * complete, la resolution echoue et l'envoi doit etre refuse.
 */
export function resoudreExpediteur(org: OrganisationExpedition | null): ResolutionExpediteur {
  if (!org) {
    return { ok: false, manquants: ['organisation introuvable'], source: 'aucune' };
  }

  // --- Source 1 : profil expediteur dedie ---------------------------------
  const aProfilDedie =
    nonVide(org.sender_address) ||
    nonVide(org.sender_postal_code) ||
    nonVide(org.sender_city);

  if (aProfilDedie) {
    const manquants: string[] = [];
    if (!nonVide(org.sender_address)) manquants.push('adresse expediteur');
    if (!codePostalValide(org.sender_postal_code)) manquants.push('code postal expediteur');
    if (!nonVide(org.sender_city)) manquants.push('ville expediteur');

    // Le pli doit porter une identite : personne physique ou raison sociale.
    const aIdentite =
      nonVide(org.sender_company) ||
      nonVide(org.sender_last_name) ||
      nonVide(org.name);
    if (!aIdentite) manquants.push('nom ou raison sociale expediteur');

    if (manquants.length > 0) {
      return { ok: false, manquants, source: 'profil_expediteur' };
    }

    return {
      ok: true,
      source: 'profil_expediteur',
      manquants: [],
      adresse: nettoyer({
        civilite: str(org.sender_civilite),
        prenom: str(org.sender_first_name),
        nom: str(org.sender_last_name),
        nom_societe: str(org.sender_company) || str(org.name),
        adresse_ligne1: str(org.sender_address)!,
        adresse_ligne2: str(org.sender_address2),
        code_postal: str(org.sender_postal_code)!,
        ville: str(org.sender_city)!,
        pays: str(org.sender_country) || 'FRANCE',
      }),
    };
  }

  // --- Source 2 : adresse de l'organisation --------------------------------
  const manquants: string[] = [];
  if (!nonVide(org.address)) manquants.push('adresse de l\'organisation');
  if (!codePostalValide(org.postal_code)) manquants.push('code postal de l\'organisation');
  if (!nonVide(org.city)) manquants.push('ville de l\'organisation');
  if (!nonVide(org.name)) manquants.push('nom de l\'organisation');

  if (manquants.length > 0) {
    return { ok: false, manquants, source: 'aucune' };
  }

  return {
    ok: true,
    source: 'adresse_organisation',
    manquants: [],
    adresse: nettoyer({
      nom_societe: str(org.name)!,
      adresse_ligne1: str(org.address)!,
      code_postal: str(org.postal_code)!,
      ville: str(org.city)!,
      pays: str(org.country) || 'FRANCE',
    }),
  };
}

function str(valeur: unknown): string | undefined {
  return typeof valeur === 'string' && valeur.trim() ? valeur.trim() : undefined;
}

/** Retire les champs vides : Service Postal rejette les cles a undefined. */
function nettoyer(adresse: AdresseExpedition): AdresseExpedition {
  const copie = { ...adresse } as Record<string, unknown>;
  for (const cle of Object.keys(copie)) {
    if (copie[cle] === undefined || copie[cle] === '') delete copie[cle];
  }
  return copie as unknown as AdresseExpedition;
}

/** Message d'erreur actionnable a renvoyer au client. */
export function messageExpediteurIncomplet(resolution: ResolutionExpediteur): string {
  return (
    'Profil expediteur incomplet, envoi refuse. ' +
    `Champs a renseigner : ${resolution.manquants.join(', ')}. ` +
    'Un courrier ne peut pas partir avec une adresse de retour non renseignee : ' +
    'le pli reviendrait a un expediteur inexistant et une lettre recommandee ' +
    'perdrait toute valeur juridique.'
  );
}

/** Valide une adresse de destination avant tout debit. */
export function validerDestinataire(dest: unknown): { ok: boolean; manquants: string[] } {
  const manquants: string[] = [];
  const d = (dest || {}) as Record<string, unknown>;

  if (!nonVide(d.adresse_ligne1)) manquants.push('adresse_ligne1');
  if (!codePostalValide(d.code_postal)) manquants.push('code_postal (5 chiffres)');
  if (!nonVide(d.ville)) manquants.push('ville');

  const aIdentite = nonVide(d.nom) || nonVide(d.nom_societe);
  if (!aIdentite) manquants.push('nom ou nom_societe');

  return { ok: manquants.length === 0, manquants };
}
