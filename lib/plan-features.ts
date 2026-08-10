/**
 * Fonctionnalités autorisées par plan.
 *
 * LE PROBLÈME QUE CE MODULE RÉSOUT
 *
 * Rien de ce qui est vendu à 97 EUR par mois n'était verrouillé. Un compte
 * gratuit accédait au CRM, aux campagnes, au courrier, à l'analytique, à
 * l'enrichissement, aux exports et aux recherches sauvegardées. Le seul contrôle
 * de plan existant portait sur l'ajout de membres d'organisation.
 *
 * LA RÈGLE DE LECTURE
 *
 * Le plan gratuit annonce exactement quatre choses : 10 résultats par mois,
 * recherche par adresse, recherche par zone, export CSV basique. **Tout ce qui
 * n'y figure pas est donc Pro par construction.** C'est cette règle qui a servi
 * à établir la matrice ci-dessous, et non une énumération au cas par cas.
 *
 * BASCULE IMMÉDIATE, DÉCIDÉE PAR L'EXPLOITANT
 *
 * Aucun droit acquis, aucun régime transitoire : les comptes existants passent
 * aux limites de leur plan dès le déploiement. Le référentiel de plans devient
 * la seule source de vérité, ce qui évite de traîner deux régimes en parallèle.
 *
 * FAIL-CLOSED
 *
 * Un plan inconnu du référentiel est traité comme gratuit. La version
 * précédente faisait l'inverse : `if (subscription_plan !== 'free')` ouvrait
 * tout, et une organisation portant `enterprise`, qui ne correspond à aucune
 * ligne de `plans`, bénéficiait du Pro sans plan.
 */

import { NextResponse } from 'next/server';
import { query } from './db';
import { ApiAuthResult } from './api-auth';
import { normaliserSlug } from './search-quota';

/** Fonctionnalités soumises à contrôle de plan. */
export type Fonctionnalite =
  | 'recherche'          // recherche par adresse et par zone
  | 'export_recherche'   // export CSV des résultats de recherche
  | 'crm'                // contacts, fiches, suivi
  | 'listes'             // listes de biens et recherches sauvegardées
  | 'campagnes'          // campagnes de courrier, A/B
  | 'courrier'           // prévisualisation et envoi de plis
  | 'ia'                 // génération de modèles de courrier par IA
  | 'enrichissement'     // enrichissement de contacts
  | 'analytique'         // tableau de bord analytique et journal d'audit
  | 'export_donnees'     // export CRM et historique de courrier
  | 'multi_utilisateurs' // membres supplémentaires
  | 'personnalisation';  // identité visuelle, profil expéditeur

/**
 * Matrice plan -> fonctionnalités.
 * Les slugs sont normalisés : `gratuit` et `free` désignent le même plan.
 */
const MATRICE: Record<string, Fonctionnalite[]> = {
  free: ['recherche', 'export_recherche'],

  pro: [
    'recherche',
    'export_recherche',
    'crm',
    'listes',
    'campagnes',
    'courrier',
    'ia',
    'enrichissement',
    'analytique',
    'export_donnees',
    'multi_utilisateurs',
    'personnalisation',
  ],
};

// `starter` et `enterprise` sont acceptés par la contrainte
// organizations_subscription_plan_check mais n'ont aucune ligne dans `plans`.
// On les aligne sur Pro plutôt que de les laisser tomber en gratuit, pour ne pas
// dégrader un compte qui aurait été positionné manuellement en base.
MATRICE.starter = MATRICE.pro;
MATRICE.enterprise = MATRICE.pro;

/** Plan appliqué quand le plan de l'organisation est inconnu. */
const PLAN_PAR_DEFAUT = 'free';

/** Libellés pour les messages d'erreur. */
const LIBELLES: Record<Fonctionnalite, string> = {
  recherche: 'la recherche de propriétaires',
  export_recherche: 'l\'export des résultats de recherche',
  crm: 'le CRM',
  listes: 'les listes et recherches sauvegardées',
  campagnes: 'les campagnes de courrier',
  courrier: 'l\'envoi de courriers postaux',
  ia: 'la génération de modèles par IA',
  enrichissement: 'l\'enrichissement de contacts',
  analytique: 'le tableau de bord analytique',
  export_donnees: 'l\'export des données',
  multi_utilisateurs: 'les utilisateurs supplémentaires',
  personnalisation: 'la personnalisation',
};

/** Plans qui donnent accès à une fonctionnalité, pour le message d'upgrade. */
function plansAutorisant(fonctionnalite: Fonctionnalite): string[] {
  return Object.entries(MATRICE)
    .filter(([, features]) => features.includes(fonctionnalite))
    .map(([slug]) => slug)
    .filter((slug) => slug !== 'starter' && slug !== 'enterprise');
}

/** Slug de plan normalisé d'une organisation. */
export async function getPlanSlug(organizationId: string): Promise<string> {
  const res = await query(
    'SELECT subscription_plan FROM organizations WHERE id = $1',
    [organizationId]
  );
  if (res.rows.length === 0) return PLAN_PAR_DEFAUT;

  const slug = normaliserSlug(res.rows[0].subscription_plan);
  if (!MATRICE[slug]) {
    console.warn(
      `[PLAN] Plan "${res.rows[0].subscription_plan}" inconnu de la matrice : ` +
        'limites du plan gratuit appliquees (fail-closed).'
    );
    return PLAN_PAR_DEFAUT;
  }
  return slug;
}

export function planAutorise(slug: string, fonctionnalite: Fonctionnalite): boolean {
  const features = MATRICE[normaliserSlug(slug)] ?? MATRICE[PLAN_PAR_DEFAUT];
  return features.includes(fonctionnalite);
}

/** Liste des fonctionnalités d'un plan, pour l'interface. */
export function fonctionnalitesDuPlan(slug: string): Fonctionnalite[] {
  return MATRICE[normaliserSlug(slug)] ?? MATRICE[PLAN_PAR_DEFAUT];
}

/**
 * Garde de route. Retourne `null` si l'accès est autorisé, sinon une réponse
 * HTTP 402 prête à être renvoyée.
 *
 * Le code 402 « Payment Required » est retenu plutôt que 403 : il distingue
 * « votre plan ne couvre pas cette fonctionnalité » de « vous n'avez pas la
 * permission », qui est le rôle de checkPermission. Les deux se cumulent.
 */
export async function requireFeature(
  auth: ApiAuthResult,
  fonctionnalite: Fonctionnalite
): Promise<NextResponse | null> {
  // Un administrateur de la plateforme n'est pas un client : il n'a pas de plan
  // à respecter.
  if (auth.user.is_admin === true) return null;

  if (!auth.user.organization_id) {
    return NextResponse.json(
      { error: 'Aucune organisation associée', code: 'SANS_ORGANISATION' },
      { status: 403 }
    );
  }

  const slug = await getPlanSlug(auth.user.organization_id);
  if (planAutorise(slug, fonctionnalite)) return null;

  const requis = plansAutorisant(fonctionnalite);

  return NextResponse.json(
    {
      error:
        `Votre plan ne comprend pas ${LIBELLES[fonctionnalite]}. ` +
        `Passez a l'offre Pro pour y acceder.`,
      code: 'PLAN_INSUFFISANT',
      fonctionnalite,
      plan_actuel: slug,
      plans_requis: requis,
      upgrade_required: true,
    },
    { status: 402 }
  );
}
