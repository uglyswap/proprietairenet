/**
 * Quota de recherche, compté en RÉSULTATS et non en requêtes.
 *
 * LE MODÈLE
 *   Gratuit : 10 résultats par mois. Recherches illimitées en nombre.
 *   Pro     : résultats mensuels illimités, 200 résultats maximum par recherche.
 *
 * Un « résultat » est UN PROPRIÉTAIRE renvoyé, pas une parcelle : un même
 * propriétaire détenant douze parcelles compte pour un.
 *
 * POURQUOI LE POINT D'APPLICATION CHANGE
 *
 * Compter des requêtes se fait avant de chercher. Compter des résultats exige
 * de connaître ce que la recherche a renvoyé, donc de débiter APRÈS. Le
 * déroulé devient :
 *
 *   1. `resoudreQuota`   lit le plan et le consommé, calcule combien de
 *                        résultats cette recherche a le droit de renvoyer ;
 *   2. la recherche s'exécute avec cette limite ;
 *   3. `consommerResultats` débite le nombre réellement renvoyé.
 *
 * Une recherche sans résultat ne coûte donc rien, naturellement, sans avoir
 * besoin du trigger `trg_reverse_search_count` qui retranchait 1 au compteur :
 * en unité « résultat », ce trigger rendait un résultat gratuit à chaque
 * recherche vide.
 *
 * DEUX PIÈGES ÉVITÉS ICI
 *
 * - Ne jamais débiter le nombre de résultats trouvés AVANT filtrage.
 *   `search_history.results_count` enregistrait `mappedResults.length` alors
 *   que la réponse renvoyait `filteredResults` : l'utilisateur aurait payé des
 *   résultats jamais affichés.
 * - Fail-closed sur plan inconnu. La version précédente faisait
 *   `if (subscription_plan !== 'free') return illimité` : toute valeur
 *   inattendue ouvrait l'illimité. Une organisation porte `enterprise`, qui ne
 *   correspond à aucune ligne de `plans`, et bénéficiait donc du Pro sans plan.
 */

import { query, getColonnes } from './db';

/** Limites appliquées quand aucun plan ne correspond. Volontairement strictes. */
const REPLI_FAIL_CLOSED: LimitesPlan = {
  slug: 'inconnu',
  resultatsParMois: 10,
  resultatsParRecherche: 10,
};

/** Valeurs du plan gratuit, utilisées si la table `plans` est muette. */
const DEFAUT_GRATUIT: LimitesPlan = {
  slug: 'free',
  resultatsParMois: 10,
  resultatsParRecherche: 10,
};

/** Valeurs du plan Pro, utilisées si la table `plans` est muette. */
const DEFAUT_PRO: LimitesPlan = {
  slug: 'pro',
  resultatsParMois: null,
  resultatsParRecherche: 200,
};

export interface LimitesPlan {
  slug: string;
  /** Budget mensuel de résultats. `null` signifie illimité. */
  resultatsParMois: number | null;
  /** Plafond de résultats renvoyés par une seule recherche. */
  resultatsParRecherche: number;
}

export interface QuotaResolu {
  /** Nombre maximum de résultats que cette recherche peut renvoyer. */
  limiteEffective: number;
  /** False quand le budget mensuel est épuisé : la recherche doit être refusée. */
  autorise: boolean;
  limites: LimitesPlan;
  /** Résultats déjà consommés sur la période. */
  consomme: number;
  /** Résultats restants, `null` si illimité. */
  restant: number | null;
  /** True si `limiteEffective` est bridée par le budget et non par le plan. */
  bridePar: 'budget' | 'plan' | 'aucun';
  /**
   * Résultats réservés atomiquement avant la recherche. Le non-utilisé est
   * libéré ensuite par `consommerResultats`. Zéro pour un plan illimité, qui
   * n'a rien à réserver.
   */
  reserve: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// Lecture du référentiel de plans
// ---------------------------------------------------------------------------

/**
 * Alias historiques de slugs.
 * `plans.slug` porte `gratuit` tant que la migration 005 n'est pas appliquée,
 * alors que `organizations.subscription_plan` est contraint à
 * `free|starter|pro|enterprise`. Les deux référentiels n'ont jamais eu de point
 * de contact, d'où des jointures vides et un MRR affiché à 0.
 */
const ALIAS_SLUG: Record<string, string> = {
  gratuit: 'free',
  freemium: 'free',
  professionnel: 'pro',
};

export function normaliserSlug(slug: string | null | undefined): string {
  const s = String(slug || '').trim().toLowerCase();
  return ALIAS_SLUG[s] ?? s;
}

/**
 * Limites du plan d'une organisation.
 *
 * Lit `plans` quand les colonnes de quota existent, sinon retombe sur les
 * valeurs de référence ci-dessus. Ne devine JAMAIS l'illimité depuis une valeur
 * inattendue de `subscription_plan`.
 */
export async function resoudreLimitesPlan(
  subscriptionPlan: string | null
): Promise<LimitesPlan> {
  const slug = normaliserSlug(subscriptionPlan);

  const colonnesPlans = await getColonnes('plans');
  const aColonnesQuota =
    colonnesPlans.has('monthly_results_limit') &&
    colonnesPlans.has('max_results_per_search');

  if (aColonnesQuota) {
    // On compare sur le slug normalisé des DEUX côtés : la table peut encore
    // porter `gratuit` alors que l'organisation porte `free`.
    const res = await query(
      `SELECT slug, monthly_results_limit, max_results_per_search
         FROM plans
        WHERE lower(slug) = $1
           OR (lower(slug) = 'gratuit' AND $1 = 'free')
        ORDER BY (lower(slug) = $1) DESC
        LIMIT 1`,
      [slug]
    );

    if (res.rows.length > 0) {
      const r = res.rows[0];
      const parRecherche = Number(r.max_results_per_search);
      return {
        slug: normaliserSlug(r.slug),
        resultatsParMois:
          r.monthly_results_limit === null ? null : Number(r.monthly_results_limit),
        resultatsParRecherche:
          Number.isFinite(parRecherche) && parRecherche > 0
            ? parRecherche
            : DEFAUT_PRO.resultatsParRecherche,
      };
    }
  }

  // Pas de ligne de plan exploitable : on applique les valeurs de référence,
  // et surtout on ne suppose pas l'illimité.
  if (slug === 'free') return DEFAUT_GRATUIT;
  if (slug === 'pro' || slug === 'enterprise' || slug === 'starter') {
    return { ...DEFAUT_PRO, slug };
  }

  console.warn(
    `[QUOTA] Plan "${subscriptionPlan}" inconnu du referentiel : limites du plan ` +
      'gratuit appliquees (fail-closed).'
  );
  return REPLI_FAIL_CLOSED;
}

// ---------------------------------------------------------------------------
// Résolution du quota avant recherche
// ---------------------------------------------------------------------------

/**
 * Calcule combien de résultats la recherche a le droit de renvoyer.
 *
 * La remise à zéro de période est PARESSEUSE et se fait ici, dans la même
 * requête que la lecture : elle ne peut donc pas être oubliée, contrairement à
 * `reset_monthly_searches()` que personne n'appelle depuis la mise en service.
 */
export async function resoudreQuota(
  organizationId: string,
  options: { estAdmin?: boolean; limiteDemandee?: number } = {}
): Promise<QuotaResolu> {
  const colonnesOrg = await getColonnes('organizations');
  const aCompteurResultats = colonnesOrg.has('monthly_results_used');
  const aColonneReset = colonnesOrg.has('monthly_searches_reset_at');

  const org = await query(
    `SELECT subscription_plan,
            ${aCompteurResultats ? 'monthly_results_used' : '0 AS monthly_results_used'},
            ${aColonneReset
              ? `monthly_searches_reset_at,
                 (monthly_searches_reset_at IS NOT NULL
                  AND monthly_searches_reset_at >= date_trunc('month', now())) AS periode_en_cours`
              : `NULL AS monthly_searches_reset_at, false AS periode_en_cours`}
       FROM organizations
      WHERE id = $1`,
    [organizationId]
  );

  if (org.rows.length === 0) {
    return {
      limiteEffective: 0,
      autorise: false,
      limites: REPLI_FAIL_CLOSED,
      consomme: 0,
      restant: 0,
      reserve: 0,
      bridePar: 'budget',
      message: 'Organisation introuvable',
    };
  }

  const limites = await resoudreLimitesPlan(org.rows[0].subscription_plan);

  // Un administrateur de la plateforme n'est pas soumis au quota, mais reste
  // soumis au plafond par recherche : il sert à protéger la base, pas à vendre.
  if (options.estAdmin) {
    return {
      limiteEffective: plafonner(limites.resultatsParRecherche, options.limiteDemandee),
      autorise: true,
      limites,
      consomme: 0,
      restant: null,
      reserve: 0,
      bridePar: 'plan',
    };
  }

  // Nouvelle période : le consommé repart de zéro. Tant que la colonne de
  // période n'existe pas, on ne peut pas savoir si la période a tourné, donc on
  // ne bloque pas (un quota sans remise à zéro est un blocage définitif).
  // La comparaison de periode se fait cote PostgreSQL, avec la MEME horloge et
  // le meme fuseau que l'ecriture (date_trunc('month', now())). La calculer en
  // JavaScript avec Date.UTC comparait deux horloges differentes : selon le
  // fuseau du serveur applicatif, le dernier ou le premier jour du mois pouvait
  // basculer du mauvais cote, et offrir ou retirer un budget entier.
  const periodeEnCours = org.rows[0].periode_en_cours === true;
  const consomme = periodeEnCours ? Number(org.rows[0].monthly_results_used || 0) : 0;

  if (limites.resultatsParMois === null) {
    return {
      limiteEffective: plafonner(limites.resultatsParRecherche, options.limiteDemandee),
      autorise: true,
      limites,
      consomme,
      restant: null,
      reserve: 0,
      bridePar: 'plan',
    };
  }

  if (!aColonneReset) {
    console.warn(
      '[QUOTA] organizations.monthly_searches_reset_at absente : quota non ' +
        'bloquant. Appliquer migrations/005 puis 007.'
    );
    return {
      limiteEffective: plafonner(limites.resultatsParRecherche, options.limiteDemandee),
      autorise: true,
      limites,
      consomme,
      restant: Math.max(0, limites.resultatsParMois - consomme),
      reserve: 0,
      bridePar: 'plan',
    };
  }

  const restant = Math.max(0, limites.resultatsParMois - consomme);

  if (restant === 0) {
    return {
      limiteEffective: 0,
      autorise: false,
      limites,
      consomme,
      restant: 0,
      reserve: 0,
      bridePar: 'budget',
      message:
        `Vous avez utilisé vos ${limites.resultatsParMois} résultats de recherche ` +
        'de ce mois. Passez à l\'offre Pro pour des résultats illimités.',
    };
  }

  const parPlan = plafonner(limites.resultatsParRecherche, options.limiteDemandee);

  // RESERVATION ATOMIQUE.
  //
  // Lire le consomme puis debiter apres la recherche laissait N recherches
  // simultanees consommer chacune le budget entier : entre la lecture et le
  // debit, chacune croyait disposer de la totalite.
  //
  // Tenir un verrou pendant la recherche n'est pas une option : un appel au
  // backend cadastre peut durer 120 secondes, et verrouiller la ligne de
  // l'organisation aussi longtemps bloquerait tout son trafic.
  //
  // On reserve donc AVANT, en une seule instruction serialisee par un
  // SELECT ... FOR UPDATE, puis on libere le non-utilise APRES. Deux recherches
  // concurrentes se partagent le budget au lieu de le dupliquer.
  const reservation = await query(
    `WITH avant AS (
       SELECT id,
              CASE WHEN monthly_searches_reset_at IS NULL
                     OR monthly_searches_reset_at < date_trunc('month', now())
                   THEN 0
                   ELSE COALESCE(monthly_results_used, 0) END AS consomme
         FROM organizations
        WHERE id = $1
          FOR UPDATE
     ),
     calc AS (
       SELECT id, consomme,
              LEAST($2::int, GREATEST($3::int - consomme, 0)) AS accorde
         FROM avant
     )
     UPDATE organizations o
        SET monthly_results_used      = c.consomme + c.accorde,
            monthly_searches_reset_at = date_trunc('month', now()),
            updated_at                = now()
       FROM calc c
      WHERE o.id = c.id
     RETURNING c.accorde AS accorde, o.monthly_results_used AS consomme_apres`,
    [organizationId, parPlan, limites.resultatsParMois]
  );

  const accorde = Number(reservation.rows[0]?.accorde ?? 0);
  const consommeApres = Number(reservation.rows[0]?.consomme_apres ?? consomme);

  if (accorde === 0) {
    return {
      limiteEffective: 0,
      autorise: false,
      limites,
      consomme: consommeApres,
      restant: 0,
      reserve: 0,
      bridePar: 'budget',
      message:
        `Vous avez utilisé vos ${limites.resultatsParMois} résultats de recherche ` +
        "de ce mois. Passez à l'offre Pro pour des résultats illimités.",
    };
  }

  const restantApres = Math.max(0, limites.resultatsParMois - consommeApres);

  return {
    limiteEffective: accorde,
    autorise: true,
    limites,
    consomme: consommeApres,
    restant: restantApres,
    reserve: accorde,
    bridePar: accorde < parPlan ? 'budget' : 'plan',
    message:
      restantApres <= 3
        ? `Il vous reste ${restantApres} résultat${restantApres > 1 ? 's' : ''} ce mois-ci.`
        : undefined,
  };
}

function plafonner(plafondPlan: number, demande?: number): number {
  if (typeof demande === 'number' && demande > 0) {
    return Math.min(plafondPlan, Math.floor(demande));
  }
  return plafondPlan;
}

// ---------------------------------------------------------------------------
// Débit après recherche
// ---------------------------------------------------------------------------

export interface ConsommationResultat {
  consomme: number;
  restant: number | null;
  applique: boolean;
}

/**
 * Solde la réservation en libérant ce qui n'a pas été utilisé.
 *
 * Le débit a déjà eu lieu au moment de la réservation, dans `resoudreQuota` :
 * c'est ce qui rend le quota résistant à la concurrence. Il ne reste donc ici
 * qu'à RENDRE la différence entre ce qui était réservé et ce qui a réellement
 * été renvoyé.
 *
 * Une recherche sans résultat rend l'intégralité de sa réservation : elle ne
 * coûte rien, sans qu'aucun trigger correctif ne soit nécessaire.
 *
 * `nombreResultats` doit être le compte APRÈS filtrage et APRÈS troncature,
 * c'est-à-dire la longueur exacte du tableau envoyé au client.
 */
export async function consommerResultats(
  organizationId: string,
  nombreResultats: number,
  limites: LimitesPlan,
  reserve: number = 0
): Promise<ConsommationResultat> {
  // Plan illimité, ou réservation impossible faute de colonne : rien à solder.
  if (reserve <= 0 || limites.resultatsParMois === null) {
    return {
      consomme: 0,
      restant: limites.resultatsParMois === null ? null : 0,
      applique: false,
    };
  }

  const aLiberer = Math.max(0, reserve - Math.max(0, nombreResultats));

  if (aLiberer === 0) {
    // Toute la réservation a servi : le compteur est déjà juste.
    const solde = await query(
      'SELECT monthly_results_used FROM organizations WHERE id = $1',
      [organizationId]
    );
    const consomme = Number(solde.rows[0]?.monthly_results_used ?? 0);
    return {
      consomme,
      restant: Math.max(0, limites.resultatsParMois - consomme),
      applique: true,
    };
  }

  // Libération atomique. `GREATEST(..., 0)` empêche un compteur négatif si deux
  // libérations se croisaient.
  const res = await query(
    `UPDATE organizations
        SET monthly_results_used = GREATEST(COALESCE(monthly_results_used, 0) - $2, 0),
            updated_at = now()
      WHERE id = $1
      RETURNING monthly_results_used`,
    [organizationId, aLiberer]
  );

  const consomme = Number(res.rows[0]?.monthly_results_used ?? 0);
  return {
    consomme,
    restant: Math.max(0, limites.resultatsParMois - consomme),
    applique: true,
  };
}

/**
 * Bloc de quota à joindre à la réponse d'une recherche.
 *
 * `total_disponible` est le nombre réel de propriétaires que la recherche a
 * trouvés, indépendamment de ceux renvoyés. Le backend le calcule déjà
 * (`total_dans_polygone`) : l'exposer permet de dire « 487 propriétaires dans
 * cette zone, vous en voyez 10 » au lieu de laisser croire qu'il n'y en a que
 * 10. Taire la troncature est un mensonge sur la donnée.
 */
export function blocQuota(
  quota: QuotaResolu,
  nombreRenvoye: number,
  totalDisponible?: number | null
): Record<string, unknown> {
  const tronque =
    typeof totalDisponible === 'number' && totalDisponible > nombreRenvoye;

  return {
    plan: quota.limites.slug,
    resultats_renvoyes: nombreRenvoye,
    total_disponible: totalDisponible ?? nombreRenvoye,
    tronque,
    tronque_par: tronque ? quota.bridePar : null,
    limite_par_recherche: quota.limites.resultatsParRecherche,
    limite_mensuelle: quota.limites.resultatsParMois,
    restant: quota.restant,
    upgrade_requis: tronque && quota.bridePar === 'budget',
    message: quota.message,
  };
}
