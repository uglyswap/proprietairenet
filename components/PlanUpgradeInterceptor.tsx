'use client';

/**
 * Affiche un message clair quand une action est refusée par le plan.
 *
 * POURQUOI UN INTERCEPTEUR GLOBAL PLUTÔT QU'UNE MODIFICATION PAR PAGE
 *
 * Le verrouillage par plan fait répondre 402 à une quinzaine de routes. Or une
 * seule page du tableau de bord savait traiter `upgrade_required` : toutes les
 * autres font `if (res.ok) { ... }` et laissent le refus tomber dans une branche
 * d'erreur générique. Un compte gratuit aurait donc vu des pages vides ou un
 * « Erreur réseau », sans jamais comprendre qu'il lui suffit de passer à Pro.
 *
 * Avec la bascule immédiate décidée pour les 162 comptes existants, ce cas n'est
 * pas théorique : il se produit au premier chargement suivant le déploiement.
 *
 * Modifier une dizaine de pages une par une aurait laissé passer celles qu'on
 * oublie, et il en reste toujours. Un point d'interception unique garantit la
 * couverture, y compris pour les pages écrites plus tard.
 *
 * CE QUE L'INTERCEPTEUR NE FAIT PAS
 * Il ne modifie ni la requête, ni la réponse, ni le flux de contrôle : il
 * observe, affiche un message, et laisse la réponse poursuivre son chemin
 * intacte. Une page qui gère déjà le 402 elle-même continue de fonctionner à
 * l'identique. Seules les réponses 402 portant `upgrade_required` sont
 * observées ; tout le reste passe sans être touché.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';

/** Évite d'installer l'intercepteur deux fois en développement (double montage). */
const MARQUEUR = '__planUpgradeInterceptorInstalle';

/** Ne pas répéter le même message en boucle quand une page enchaîne les appels. */
const DELAI_ANTI_REPETITION_MS = 4000;

export function PlanUpgradeInterceptor() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cible = window as unknown as Record<string, unknown>;
    if (cible[MARQUEUR]) return;
    cible[MARQUEUR] = true;

    const fetchOriginal = window.fetch.bind(window);
    let dernierMessage = '';
    let dernierAffichage = 0;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const reponse = await fetchOriginal(...args);

      // 402 « Payment Required » est le seul code émis par requireFeature.
      if (reponse.status !== 402) return reponse;

      // La réponse est clonée : lire le corps de l'originale le consommerait et
      // la rendrait inutilisable pour l'appelant.
      try {
        const donnees = await reponse.clone().json();
        if (!donnees?.upgrade_required) return reponse;

        const message =
          typeof donnees.error === 'string' && donnees.error.trim()
            ? donnees.error
            : 'Cette fonctionnalité est réservée à l\'offre Pro.';

        const maintenant = Date.now();
        const repetition =
          message === dernierMessage &&
          maintenant - dernierAffichage < DELAI_ANTI_REPETITION_MS;

        if (!repetition) {
          dernierMessage = message;
          dernierAffichage = maintenant;
          toast.error(message, {
            duration: 8000,
            action: {
              label: 'Voir les offres',
              onClick: () => {
                window.location.href = '/pricing';
              },
            },
          });
        }
      } catch {
        // Corps illisible ou non JSON : on ne fait rien, la réponse suit son
        // cours. Ne jamais faire échouer une requête à cause de l'affichage.
      }

      return reponse;
    };

    return () => {
      window.fetch = fetchOriginal;
      delete cible[MARQUEUR];
    };
  }, []);

  return null;
}
