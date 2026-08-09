/**
 * Ecriture dans mail_history, adaptee au schema reellement present.
 *
 * POURQUOI CE MODULE EXISTE
 *
 * La table mail_history de production porte :
 *   id, user_id, organization_id, recipient (NOT NULL), subject, body,
 *   template_id, status, sent_at, service_postal_uid, type_affranchissement,
 *   destinataire, recipient_name, credits_used, updated_at, prix
 *
 * Le code nommait `couleur`, `recto_verso`, `preview_url` et `expediteur`, qui
 * n'existent pas, et n'a JAMAIS fourni `recipient`, qui est NOT NULL. Les deux
 * etapes du chemin monetise levaient donc systematiquement :
 *   - la previsualisation (courrier/bulk), avant tout debit ;
 *   - l'enregistrement post-envoi (courrier/direct), APRES le debit et APRES
 *     l'impression physique, sans remboursement possible.
 *
 * Centraliser l'ecriture ici garantit qu'aucun appelant ne peut a nouveau
 * oublier `recipient` ni nommer une colonne absente.
 */

import { query, getColonnes } from './db';

export interface LigneMailHistory {
  userId: string;
  organizationId: string;
  serviceP1ostalUid?: string;
  service_postal_uid?: string;
  destinataire: Record<string, unknown>;
  expediteur?: Record<string, unknown>;
  typeAffranchissement: string;
  couleur?: string;
  rectoVerso?: string;
  status: 'preview' | 'sent' | 'failed' | 'refunded';
  prix?: number;
  creditsUsed?: number;
  previewUrl?: string | null;
  templateId?: string | null;
  sentAt?: Date | null;
}

/**
 * Libelle du destinataire, obligatoire (colonne NOT NULL).
 * Un pli a toujours un destinataire lisible : a defaut d'identite, l'adresse.
 */
export function libelleDestinataire(dest: Record<string, unknown>): string {
  const identite = [dest.nom_societe, dest.prenom, dest.nom]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (identite) return identite;

  const adresse = String(dest.adresse_ligne1 || '').trim();
  if (adresse) return adresse;

  return 'Destinataire non renseigne';
}

/**
 * Insere une ligne, en ne nommant que les colonnes reellement presentes.
 * Retourne la liste des champs qui n'ont pas pu etre enregistres, afin que
 * l'appelant puisse le signaler plutot que de le supposer.
 */
export async function insererMailHistory(
  ligne: LigneMailHistory
): Promise<{ colonnesIgnorees: string[] }> {
  const existantes = await getColonnes('mail_history');
  const libelle = libelleDestinataire(ligne.destinataire);
  const uid = ligne.service_postal_uid ?? ligne.serviceP1ostalUid ?? null;

  const candidats: Array<[string, unknown]> = [
    ['user_id', ligne.userId],
    ['organization_id', ligne.organizationId],
    // NOT NULL : c'est l'omission qui faisait echouer chaque insertion.
    ['recipient', libelle],
    ['recipient_name', libelle],
    ['service_postal_uid', uid],
    ['destinataire', JSON.stringify(ligne.destinataire)],
    ['type_affranchissement', ligne.typeAffranchissement],
    ['status', ligne.status],
    ['prix', ligne.prix ?? 0],
    ['credits_used', ligne.creditsUsed ?? 0],
    ['template_id', ligne.templateId ?? null],
    // Colonnes attendues par le code et absentes de la production.
    ['couleur', ligne.couleur ?? null],
    ['recto_verso', ligne.rectoVerso ?? null],
    ['preview_url', ligne.previewUrl ?? null],
    ['expediteur', ligne.expediteur ? JSON.stringify(ligne.expediteur) : null],
    ['sent_at', ligne.sentAt ?? (ligne.status === 'sent' ? new Date() : null)],
  ];

  const retenus = candidats.filter(([colonne]) => existantes.has(colonne));
  const ignorees = candidats
    .filter(([colonne, valeur]) => !existantes.has(colonne) && valeur !== null)
    .map(([colonne]) => colonne);

  const colonnes = retenus.map(([c]) => c);
  const valeurs = retenus.map(([, v]) => v);
  const placeholders = valeurs.map((_, i) => `$${i + 1}`).join(', ');

  await query(
    `INSERT INTO mail_history (${colonnes.join(', ')}) VALUES (${placeholders})`,
    valeurs
  );

  return { colonnesIgnorees: ignorees };
}

/**
 * Passe un pli previsualise a l'etat indique.
 * Utilise pour sortir du lot les plis rembourses : un pli qui reste en
 * 'preview' apres remboursement pourrait etre revalide, donc imprime et poste
 * une seconde fois sans nouveau debit.
 */
export async function marquerStatutPli(
  uid: string,
  organizationId: string,
  status: 'sent' | 'failed' | 'refunded',
  creditsUsed?: number
): Promise<void> {
  const existantes = await getColonnes('mail_history');

  const majs = ['status = $1'];
  const valeurs: unknown[] = [status];
  let i = 2;

  if (creditsUsed !== undefined && existantes.has('credits_used')) {
    majs.push(`credits_used = $${i++}`);
    valeurs.push(creditsUsed);
  }
  if (status === 'sent' && existantes.has('sent_at')) {
    majs.push('sent_at = now()');
  }
  if (existantes.has('updated_at')) {
    majs.push('updated_at = now()');
  }

  valeurs.push(uid, organizationId);

  await query(
    `UPDATE mail_history SET ${majs.join(', ')}
      WHERE service_postal_uid = $${i++} AND organization_id = $${i}`,
    valeurs
  );
}
