/**
 * Gestion des credits : debit, remboursement, octroi, reconciliation.
 *
 * INVARIANT CENTRAL
 *   organizations.credits_balance = SUM(credit_transactions.amount)
 *
 * Cet invariant etait viole par construction : les consommations modifiaient
 * `credits_balance` sans toujours ecrire de ligne dans `credit_transactions`,
 * alors que les remboursements en ecrivaient une. Le solde n'etait donc pas
 * reconstructible, et le chiffre d'affaires pas connaissable.
 *
 * Ce module est le SEUL point d'ecriture autorise sur les credits. Toute
 * modification de solde y passe, et chaque modification ecrit sa ligne de
 * journal DANS LA MEME TRANSACTION. Il devient impossible de bouger un solde
 * sans laisser de trace.
 *
 * COMPATIBILITE DE SCHEMA
 * La cause racine des pannes de ce produit est du code ecrit contre un schema
 * jamais applique. Ce module ne repete pas l'erreur : il detecte une fois les
 * colonnes reellement presentes et s'adapte. Il fonctionne sur le schema actuel
 * (organization_id, user_id, amount, type, description, created_at) et gagne
 * l'idempotence et la tracabilite monetaire des que la migration 004 est
 * appliquee.
 */

import { PoolClient } from 'pg';
import pool, { query, withTransaction } from './db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Nature d'un mouvement de credits.
 * `credit_transactions.type` est un text libre en production : aucune valeur
 * n'est rejetee par la base. On restreint donc cote applicatif.
 */
export type CreditTransactionType =
  | 'bonus'        // credits offerts a l'inscription ou par un administrateur
  | 'purchase'     // achat d'un pack via Stripe
  | 'subscription' // credits inclus dans un abonnement
  | 'usage'        // consommation (courrier, generation IA)
  | 'refund'       // remboursement d'une consommation qui n'a pas abouti
  | 'adjustment';  // correction manuelle, tracee

export interface MouvementCredits {
  organizationId: string;
  userId?: string | null;
  /** Valeur absolue du mouvement, toujours positive. Le signe vient du sens. */
  montant: number;
  type: CreditTransactionType;
  description: string;
  /**
   * Cle d'idempotence. Deux appels portant la meme reference ne produisent
   * qu'un seul mouvement. Indispensable sur le circuit d'argent : sans elle,
   * un rejeu de requete debite deux fois.
   * Ignoree si la colonne n'existe pas encore en base.
   */
  reference?: string;
  /** Montant reellement encaisse ou depense, en centimes d'euro. */
  montantEurCentimes?: number;
  metadata?: Record<string, unknown>;
}

export interface ResultatMouvement {
  /** Solde apres application du mouvement. */
  soldeApres: number;
  /** False quand la reference d'idempotence avait deja ete traitee. */
  applique: boolean;
  transactionId?: string;
}

export class CreditsInsuffisantsError extends Error {
  code = 'CREDITS_INSUFFISANTS';
  constructor(
    public requis: number,
    public disponible: number
  ) {
    super(`Credits insuffisants. Requis: ${requis}, disponible: ${disponible}`);
    this.name = 'CreditsInsuffisantsError';
  }
}

// ---------------------------------------------------------------------------
// Detection des colonnes optionnelles
// ---------------------------------------------------------------------------

interface SchemaCredits {
  reference: boolean;
  /** True seulement si un index unique NON PARTIEL couvre `reference`. */
  referenceIndexUtilisable: boolean;
  balanceAfter: boolean;
  metadata: boolean;
  amountEurCentimes: boolean;
}

let schemaCache: SchemaCredits | null = null;

async function detecterSchema(): Promise<SchemaCredits> {
  if (schemaCache) return schemaCache;

  const res = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'credit_transactions'`
  );
  const colonnes = new Set(res.rows.map((r: { column_name: string }) => r.column_name));

  // La presence de la colonne ne suffit PAS a autoriser `ON CONFLICT`.
  //
  // PostgreSQL n'accepte un index partiel comme arbitre de conflit que si le
  // predicat de l'index est repete dans la clause. Avec un index partiel et un
  // simple `ON CONFLICT (reference)`, la planification leve 42P10 a CHAQUE
  // insertion referencee, qu'il y ait conflit ou non : le circuit d'argent
  // tomberait integralement.
  //
  // On verifie donc qu'il existe un index UNIQUE, NON PARTIEL, portant
  // exactement la colonne `reference`. A defaut, on retombe sur l'idempotence
  // par pre-lecture, qui reste correcte a l'interieur d'une transaction.
  let indexUtilisable = false;
  if (colonnes.has('reference')) {
    const idx = await query(
      `SELECT 1
         FROM pg_index i
         JOIN pg_class c   ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'credit_transactions'
          AND i.indisunique
          AND i.indpred IS NULL
          AND i.indnatts = 1
          AND (
            SELECT attname FROM pg_attribute
             WHERE attrelid = c.oid AND attnum = i.indkey[0]
          ) = 'reference'
        LIMIT 1`
    );
    indexUtilisable = idx.rows.length > 0;

    if (!indexUtilisable) {
      console.warn(
        '[CREDITS] Colonne reference presente mais aucun index unique total ne ' +
          'la couvre : ON CONFLICT desactive, idempotence assuree par ' +
          'pre-lecture transactionnelle.'
      );
    }
  }

  schemaCache = {
    reference: colonnes.has('reference'),
    referenceIndexUtilisable: indexUtilisable,
    balanceAfter: colonnes.has('balance_after'),
    metadata: colonnes.has('metadata'),
    amountEurCentimes: colonnes.has('amount_eur_centimes'),
  };

  if (!schemaCache.reference) {
    console.warn(
      '[CREDITS] Colonne credit_transactions.reference absente : idempotence ' +
        'reduite a la pre-lecture. Appliquer migrations/004_credits_ledger.sql.'
    );
  }
  return schemaCache;
}

/** Reinitialise le cache. Utile apres application d'une migration. */
export function invaliderCacheSchema(): void {
  schemaCache = null;
}

// ---------------------------------------------------------------------------
// Ecriture du journal
// ---------------------------------------------------------------------------

async function insererLigneJournal(
  client: PoolClient,
  mouvement: MouvementCredits,
  montantSigne: number,
  soldeApres: number
): Promise<{ id?: string; insere: boolean }> {
  const schema = await detecterSchema();

  const colonnes = ['organization_id', 'user_id', 'amount', 'type', 'description'];
  const valeurs: unknown[] = [
    mouvement.organizationId,
    mouvement.userId ?? null,
    montantSigne,
    mouvement.type,
    mouvement.description,
  ];

  if (schema.reference && mouvement.reference) {
    colonnes.push('reference');
    valeurs.push(mouvement.reference);
  }
  if (schema.balanceAfter) {
    colonnes.push('balance_after');
    valeurs.push(soldeApres);
  }
  if (schema.amountEurCentimes && mouvement.montantEurCentimes !== undefined) {
    colonnes.push('amount_eur_centimes');
    valeurs.push(mouvement.montantEurCentimes);
  }
  if (schema.metadata && mouvement.metadata) {
    colonnes.push('metadata');
    valeurs.push(JSON.stringify(mouvement.metadata));
  }

  const placeholders = valeurs.map((_, i) => `$${i + 1}`).join(', ');
  // `ON CONFLICT` n'est emis que si un index unique total le rend inferable.
  const conflit =
    schema.referenceIndexUtilisable && mouvement.reference
      ? 'ON CONFLICT (reference) DO NOTHING'
      : '';

  const res = await client.query(
    `INSERT INTO credit_transactions (${colonnes.join(', ')})
     VALUES (${placeholders})
     ${conflit}
     RETURNING id`,
    valeurs
  );

  return { id: res.rows[0]?.id, insere: (res.rowCount ?? 0) > 0 };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Debite des credits.
 *
 * Le debit est ATOMIQUE : la clause `WHERE credits_balance >= $1` empeche la
 * double depense concurrente, et l'ecriture du journal a lieu dans la meme
 * transaction que la mise a jour du solde.
 *
 * L'appelant DOIT fournir un client de transaction. Cette contrainte est
 * volontaire : elle rend impossible d'appeler ce debit hors transaction, donc
 * de laisser un solde modifie sans ligne de journal.
 */
export async function debiterCredits(
  client: PoolClient,
  mouvement: MouvementCredits
): Promise<ResultatMouvement> {
  if (mouvement.montant <= 0) {
    throw new Error('Le montant d\'un debit doit etre strictement positif');
  }

  const schema = await detecterSchema();

  // Idempotence : si la reference a deja ete traitee, on ne rejoue pas.
  if (schema.reference && mouvement.reference) {
    const existant = await client.query(
      'SELECT id FROM credit_transactions WHERE reference = $1 LIMIT 1',
      [mouvement.reference]
    );
    if (existant.rows.length > 0) {
      const solde = await client.query(
        'SELECT credits_balance FROM organizations WHERE id = $1',
        [mouvement.organizationId]
      );
      return {
        soldeApres: solde.rows[0]?.credits_balance ?? 0,
        applique: false,
        transactionId: existant.rows[0].id,
      };
    }
  }

  const debit = await client.query(
    `UPDATE organizations
        SET credits_balance = credits_balance - $1,
            credits_used    = credits_used + $1,
            updated_at      = now()
      WHERE id = $2
        AND credits_balance >= $1
      RETURNING credits_balance`,
    [mouvement.montant, mouvement.organizationId]
  );

  if (debit.rows.length === 0) {
    const actuel = await client.query(
      'SELECT credits_balance FROM organizations WHERE id = $1',
      [mouvement.organizationId]
    );
    throw new CreditsInsuffisantsError(
      mouvement.montant,
      actuel.rows[0]?.credits_balance ?? 0
    );
  }

  const soldeApres: number = debit.rows[0].credits_balance;
  const ligne = await insererLigneJournal(client, mouvement, -mouvement.montant, soldeApres);

  return { soldeApres, applique: true, transactionId: ligne.id };
}

/**
 * Recredite des credits (remboursement ou octroi).
 *
 * `credits_used` est diminue en meme temps pour un remboursement, mais jamais
 * en dessous de zero : un remboursement ne doit pas rendre le compteur de
 * consommation negatif.
 */
export async function crediterCredits(
  client: PoolClient,
  mouvement: MouvementCredits
): Promise<ResultatMouvement> {
  if (mouvement.montant <= 0) {
    throw new Error('Le montant d\'un credit doit etre strictement positif');
  }

  const schema = await detecterSchema();

  if (schema.reference && mouvement.reference) {
    const existant = await client.query(
      'SELECT id FROM credit_transactions WHERE reference = $1 LIMIT 1',
      [mouvement.reference]
    );
    if (existant.rows.length > 0) {
      const solde = await client.query(
        'SELECT credits_balance FROM organizations WHERE id = $1',
        [mouvement.organizationId]
      );
      return {
        soldeApres: solde.rows[0]?.credits_balance ?? 0,
        applique: false,
        transactionId: existant.rows[0].id,
      };
    }
  }

  const estRemboursement = mouvement.type === 'refund';

  const maj = await client.query(
    `UPDATE organizations
        SET credits_balance = credits_balance + $1,
            credits_used    = CASE WHEN $2::boolean
                                   THEN GREATEST(credits_used - $1, 0)
                                   ELSE credits_used END,
            updated_at      = now()
      WHERE id = $3
      RETURNING credits_balance`,
    [mouvement.montant, estRemboursement, mouvement.organizationId]
  );

  if (maj.rows.length === 0) {
    throw new Error(`Organisation introuvable: ${mouvement.organizationId}`);
  }

  const soldeApres: number = maj.rows[0].credits_balance;
  const ligne = await insererLigneJournal(client, mouvement, mouvement.montant, soldeApres);

  return { soldeApres, applique: true, transactionId: ligne.id };
}

/**
 * Debite dans sa propre transaction. Raccourci pour les appelants qui n'ont pas
 * deja une transaction ouverte.
 */
export async function debiterCreditsAutonome(
  mouvement: MouvementCredits
): Promise<ResultatMouvement> {
  return withTransaction((client) => debiterCredits(client, mouvement));
}

/** Recredite dans sa propre transaction. */
export async function crediterCreditsAutonome(
  mouvement: MouvementCredits
): Promise<ResultatMouvement> {
  return withTransaction((client) => crediterCredits(client, mouvement));
}

// ---------------------------------------------------------------------------
// Lecture et controle
// ---------------------------------------------------------------------------

export async function getSolde(organizationId: string): Promise<number> {
  const res = await query('SELECT credits_balance FROM organizations WHERE id = $1', [
    organizationId,
  ]);
  return res.rows[0]?.credits_balance ?? 0;
}

export interface Reconciliation {
  organizationId: string;
  soldeEnregistre: number;
  soldeJournal: number;
  ecart: number;
  coherent: boolean;
}

/**
 * Verifie l'invariant credits_balance = SUM(amount) pour une organisation.
 *
 * Un ecart non nul signale soit un mouvement passe hors de ce module, soit une
 * organisation creee avant sa mise en place. Il ne se corrige pas
 * automatiquement : une correction silencieuse masquerait la fuite.
 */
export async function reconcilier(organizationId: string): Promise<Reconciliation> {
  const res = await query(
    `SELECT o.credits_balance,
            COALESCE((SELECT SUM(amount) FROM credit_transactions
                       WHERE organization_id = o.id), 0) AS solde_journal
       FROM organizations o
      WHERE o.id = $1`,
    [organizationId]
  );

  const soldeEnregistre: number = res.rows[0]?.credits_balance ?? 0;
  const soldeJournal = Number(res.rows[0]?.solde_journal ?? 0);

  return {
    organizationId,
    soldeEnregistre,
    soldeJournal,
    ecart: soldeEnregistre - soldeJournal,
    coherent: soldeEnregistre === soldeJournal,
  };
}

/** Toutes les organisations dont le solde ne correspond pas a leur journal. */
export async function listerIncoherences(): Promise<Reconciliation[]> {
  const res = await query(
    `SELECT o.id,
            o.credits_balance,
            COALESCE(t.total, 0) AS solde_journal
       FROM organizations o
       LEFT JOIN (
         SELECT organization_id, SUM(amount) AS total
           FROM credit_transactions
          GROUP BY organization_id
       ) t ON t.organization_id = o.id
      WHERE o.credits_balance <> COALESCE(t.total, 0)`
  );

  return res.rows.map((r: { id: string; credits_balance: number; solde_journal: string }) => ({
    organizationId: r.id,
    soldeEnregistre: r.credits_balance,
    soldeJournal: Number(r.solde_journal),
    ecart: r.credits_balance - Number(r.solde_journal),
    coherent: false,
  }));
}

export { pool };
