/**
 * Tarification du courrier postal : cout prestataire, marge, TVA, credits.
 *
 * POURQUOI CE MODULE
 *
 * Le bareme vivait jusqu'ici dans une table figee de six nombres
 * (`CREDIT_COSTS` de lib/service-postal.ts) accompagnee d'un commentaire
 * affirmant "prix Service Postal + 1 EUR HT de marge + 20 % TVA". Cette marge
 * n'existait nulle part dans le code : elle etait deja fondue dans les six
 * constantes. Consequences directes :
 *
 *   - impossible de savoir ce que l'entreprise gagne sur un pli ;
 *   - impossible d'ajuster la marge sans recalculer six nombres a la main ;
 *   - une hausse tarifaire du prestataire erode la marge silencieusement,
 *     jusqu'a la rendre negative sans que rien ne le signale ;
 *   - `credit_transactions` ne journalise que des credits, jamais des euros :
 *     le chiffre d'affaires n'etait pas reconstructible depuis la base.
 *
 * Ce module rend la decomposition explicite et verifiable. Le bareme par
 * defaut reproduit EXACTEMENT les six valeurs historiques : activer ce module
 * ne change aucun prix tant que la configuration n'est pas modifiee.
 *
 * UNITES
 * Tout est calcule en centimes d'euro, en nombres entiers a l'arrivee.
 * 1 credit = 0,01 EUR, donc 1 credit = 1 centime : le total TTC en centimes
 * EST le nombre de credits. Cette equivalence est verifiee par
 * CENTIMES_PAR_CREDIT et ne doit pas etre supposee ailleurs dans le code.
 */

/** Un credit vaut un centime d'euro. */
export const CENTIMES_PAR_CREDIT = 1;

/**
 * Lecture sure d'une variable d'environnement numerique.
 *
 * `Number('abc')` vaut NaN, et toute comparaison impliquant NaN est fausse :
 * `margePct < MARGE_MIN_PCT` renvoyait donc false, et le garde-fou de marge
 * minimale etait CONTOURNE par une simple faute de frappe dans la
 * configuration. Une valeur invalide est desormais ignoree au profit du defaut,
 * avec un avertissement.
 */
function nombreEnv(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || brut === null || brut.trim() === '') return defaut;

  const valeur = Number(brut);
  if (!Number.isFinite(valeur)) {
    console.warn(
      `[TARIFICATION] ${nom}="${brut}" n'est pas un nombre : valeur par defaut ${defaut} retenue.`
    );
    return defaut;
  }
  if (valeur < 0) {
    console.warn(
      `[TARIFICATION] ${nom}=${valeur} est negatif : valeur par defaut ${defaut} retenue.`
    );
    return defaut;
  }
  return valeur;
}

/** Taux de TVA applicable a la prestation, en pourcentage. */
const TVA_PCT = nombreEnv('COURRIER_TVA_PCT', 20);

/**
 * Marge fixe ajoutee a chaque pli, en centimes HT.
 * Valeur historique : 100 centimes, soit 1 EUR HT par pli.
 */
const MARGE_FIXE_HT_CENTIMES = nombreEnv('COURRIER_MARGE_FIXE_HT_CENTIMES', 100);

/**
 * Marge proportionnelle au cout prestataire, en pourcentage.
 * Zero par defaut pour reproduire le bareme historique. La passer a une valeur
 * non nulle protege la marge d'une hausse tarifaire du prestataire, ce que la
 * marge fixe seule ne fait pas.
 */
const MARGE_PCT = nombreEnv('COURRIER_MARGE_PCT', 0);

/**
 * Marge minimale acceptable, en pourcentage du cout prestataire.
 * En dessous, l'envoi est refuse plutot que vendu a perte. C'est le garde-fou
 * qui manquait : rien ne detectait une marge devenue negative.
 */
const MARGE_MIN_PCT = nombreEnv('COURRIER_MARGE_MIN_PCT', 5);

/**
 * Cout facture par Service Postal, en centimes HT, impression comprise.
 *
 * Ces valeurs sont deduites du bareme historique par decomposition inverse
 * (credits / 1,20 - 100 centimes de marge fixe). Elles doivent etre confrontees
 * a la grille tarifaire reelle du prestataire, qui n'est documentee nulle part :
 * c'est une reconstitution, pas un contrat. Toute revision de la grille doit
 * passer par ces constantes ou par la variable d'environnement associee.
 */
const COUT_PRESTATAIRE_HT_CENTIMES: Record<string, number> = {
  verte: 241.67,
  vertesuivi: 308.33,
  performance: 333.33,
  perfsuivi: 400,
  lr: 800,
  lrar: 941.67,
};

/** Type d'affranchissement par defaut quand l'appelant n'en fournit pas. */
export const TYPE_AFFRANCHISSEMENT_DEFAUT = 'verte';

export const TYPES_AFFRANCHISSEMENT = Object.keys(COUT_PRESTATAIRE_HT_CENTIMES);

export interface DecompositionTarifaire {
  type_affranchissement: string;
  /** Cout facture par le prestataire, centimes HT. */
  cout_prestataire_ht_centimes: number;
  /** Marge commerciale, centimes HT (part fixe + part proportionnelle). */
  marge_ht_centimes: number;
  /** Total hors taxes, centimes. */
  total_ht_centimes: number;
  /** TVA, centimes. */
  tva_centimes: number;
  /** Total toutes taxes comprises, centimes. C'est le montant facture. */
  total_ttc_centimes: number;
  /** Cout en credits debite a l'organisation. */
  credits: number;
  /** Marge rapportee au cout prestataire, en pourcentage. Sert au controle. */
  marge_pct_effective: number;
}

/** Erreur levee quand la tarification ne peut pas etre etablie sainement. */
export class TarificationError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'TarificationError';
    this.code = code;
  }
}

/** Cout prestataire d'un type d'affranchissement, ou null s'il est inconnu. */
function coutPrestataire(type: string): number | null {
  const nomVariable = `COURRIER_COUT_HT_${type.toUpperCase()}`;
  const surcharge = process.env[nomVariable];
  if (surcharge !== undefined && surcharge.trim() !== '') {
    const valeur = Number(surcharge);
    if (Number.isFinite(valeur) && valeur > 0) return valeur;
    console.warn(
      `[TARIFICATION] ${nomVariable}="${surcharge}" invalide : bareme de reference conserve.`
    );
  }
  return COUT_PRESTATAIRE_HT_CENTIMES[type] ?? null;
}

/**
 * Calcule la decomposition tarifaire complete d'un pli.
 *
 * Leve plutot que de retomber sur une valeur par defaut : facturer un type
 * d'affranchissement inconnu au tarif de la lettre verte, comme le faisait
 * `getCreditCost`, revient a vendre a perte une LRAR a 12,50 EUR pour 4,10 EUR
 * encaisses.
 */
export function calculerTarif(type_affranchissement: string): DecompositionTarifaire {
  const type = (type_affranchissement || '').trim().toLowerCase();

  const coutHt = coutPrestataire(type);
  if (coutHt === null) {
    throw new TarificationError(
      `Type d'affranchissement inconnu: ${type_affranchissement}`,
      'TYPE_AFFRANCHISSEMENT_INCONNU'
    );
  }

  const margeHt = MARGE_FIXE_HT_CENTIMES + (coutHt * MARGE_PCT) / 100;
  const totalHt = coutHt + margeHt;
  const totalTtc = Math.round(totalHt * (1 + TVA_PCT / 100));
  const tva = totalTtc - Math.round(totalHt);

  const margePctEffective = coutHt > 0 ? (margeHt / coutHt) * 100 : 0;

  // Un calcul non fini ne doit jamais franchir le garde-fou : toute comparaison
  // impliquant NaN est fausse, y compris `< MARGE_MIN_PCT`.
  if (!Number.isFinite(totalTtc) || !Number.isFinite(margeHt) || totalTtc <= 0) {
    throw new TarificationError(
      `Tarification non calculable pour ${type} (configuration invalide).`,
      'TARIFICATION_INVALIDE'
    );
  }

  // Garde-fou : on ne vend jamais un pli en dessous de son cout de revient.
  if (margeHt <= 0 || margePctEffective < MARGE_MIN_PCT) {
    throw new TarificationError(
      `Marge insuffisante sur ${type}: ${margePctEffective.toFixed(1)} % ` +
        `(minimum ${MARGE_MIN_PCT} %). Envoi refuse plutot que vendu a perte.`,
      'MARGE_INSUFFISANTE'
    );
  }

  const credits = Math.ceil(totalTtc / CENTIMES_PAR_CREDIT);

  return {
    type_affranchissement: type,
    cout_prestataire_ht_centimes: Math.round(coutHt),
    marge_ht_centimes: Math.round(margeHt),
    total_ht_centimes: Math.round(totalHt),
    tva_centimes: tva,
    total_ttc_centimes: totalTtc,
    credits,
    marge_pct_effective: Number(margePctEffective.toFixed(2)),
  };
}

/**
 * Cout en credits d'un pli.
 * Remplace `getCreditCost`, qui retombait silencieusement sur le tarif de la
 * lettre verte pour tout type inconnu.
 */
export function getCreditCost(type_affranchissement: string): number {
  return calculerTarif(type_affranchissement).credits;
}

/** Bareme complet, pour les pages tarifs et l'administration. */
export function baremeComplet(): DecompositionTarifaire[] {
  return TYPES_AFFRANCHISSEMENT.map((type) => calculerTarif(type));
}

/**
 * Controle de coherence de la configuration tarifaire, a appeler au demarrage.
 * Retourne la liste des anomalies, vide si tout est sain.
 */
export function verifierBareme(): string[] {
  const anomalies: string[] = [];
  for (const type of TYPES_AFFRANCHISSEMENT) {
    try {
      const tarif = calculerTarif(type);
      if (tarif.credits <= 0) {
        anomalies.push(`${type}: cout en credits nul ou negatif`);
      }
    } catch (err) {
      anomalies.push(
        `${type}: ${err instanceof Error ? err.message : 'erreur de calcul'}`
      );
    }
  }
  if (!Number.isFinite(TVA_PCT) || TVA_PCT < 0) {
    anomalies.push(`COURRIER_TVA_PCT invalide: ${TVA_PCT}`);
  }
  return anomalies;
}
