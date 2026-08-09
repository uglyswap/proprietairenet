/**
 * Reponses d'erreur normalisees pour les routes API.
 *
 * POURQUOI
 *
 * Une cinquantaine de routes renvoyaient `err.message` brut au navigateur.
 * Sur ce produit, ce message est presque toujours un message PostgreSQL :
 * l'utilisateur lisait dans un toast "la colonne p.stripe_extra_user_price_id
 * n'existe pas". Cela cartographie gratuitement le schema interne pour un
 * attaquant, expose les noms de tables, de colonnes et de contraintes, et
 * n'apporte rien a l'utilisateur legitime.
 *
 * Le detail technique part desormais dans les logs serveur, correle a la
 * reponse par un identifiant court que l'utilisateur peut transmettre au
 * support.
 *
 * Le pattern sur : log serveur detaille, message generique cote client.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

/**
 * Journalise l'erreur complete et renvoie une reponse 500 sans detail technique.
 *
 * @param contexte  Situe l'appel dans les logs (ex: 'admin/credit-packs').
 * @param erreur    L'exception capturee.
 * @param message   Message affiche a l'utilisateur.
 */
export function erreurServeur(
  contexte: string,
  erreur: unknown,
  message = 'Erreur serveur'
): NextResponse {
  const incidentId = randomUUID().slice(0, 8);
  const detail =
    erreur instanceof Error ? erreur.stack || erreur.message : String(erreur);

  console.error(`[${contexte}] incident=${incidentId}`, detail);

  return NextResponse.json(
    { error: message, incident_id: incidentId },
    { status: 500 }
  );
}

/**
 * Erreur de validation d'entree.
 * Le message est ici volontairement explicite : il decrit ce que l'appelant
 * doit corriger, jamais l'etat interne du systeme.
 */
export function erreurRequete(
  message: string,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: message, ...details }, { status: 400 });
}
