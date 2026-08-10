/**
 * Adresse et clé du service cadastral, source unique.
 *
 * Trois valeurs de repli contradictoires coexistaient dans le code :
 *   app/api/cadastre/departments : http://84.247.175.132:8765
 *   app/api/cadastre/geographic  : http://84.247.175.132:8765
 *   app/api/cadastre/search      : http://cadastre-api:3001
 *
 * L'IP publique `84.247.175.132:8765` pointe vers un serveur DISPARU, et le
 * port réellement publié est 8766, pas 8765. Deux routes sur trois se
 * rabattaient donc sur une adresse morte dès que la variable d'environnement
 * manquait, et la panne apparaissait sur certaines recherches seulement, ce qui
 * est le plus difficile à diagnostiquer.
 *
 * Le seul repli conservé est le nom de service Docker, qui correspond au
 * déploiement réel. Aucune IP n'est codée en dur.
 */

/** Nom de service interne, seul repli légitime. */
const REPLI_INTERNE = 'http://cadastre-api:3001';

export const CADASTRE_API_URL = process.env.CADASTRE_API_URL || REPLI_INTERNE;

/**
 * Même secret que `MASTER_API_KEY` côté backend, sous un autre nom. Toute
 * rotation doit changer les deux dans la même fenêtre : le frontend étant
 * fail-open sur cette variable, une désynchronisation ne se manifeste qu'à la
 * première recherche utilisateur.
 */
export const CADASTRE_API_KEY = process.env.CADASTRE_API_KEY || '';

if (!process.env.CADASTRE_API_URL) {
  console.warn(
    `[CADASTRE] CADASTRE_API_URL non definie : repli sur ${REPLI_INTERNE}. ` +
      'Definir explicitement cette variable en production.'
  );
}
if (!CADASTRE_API_KEY) {
  console.warn(
    '[CADASTRE] CADASTRE_API_KEY non definie : toutes les recherches seront ' +
      'refusees par le backend (fail-open cote frontend, echec cote backend).'
  );
}
