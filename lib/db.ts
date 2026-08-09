import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  host: process.env.DATABASE_HOST || 'proprietaire-db',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'proprietaire',
  user: process.env.DATABASE_USER || 'proprietaire',
  password: process.env.DATABASE_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export default pool;

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

/**
 * Colonnes reellement presentes en base, par table.
 *
 * La cause racine des pannes de ce produit est du code ecrit contre un schema
 * jamais applique : environ 70 colonnes attendues par le code n'existent pas en
 * production, et les erreurs `42703 column does not exist` etaient avalees,
 * donc invisibles pendant des mois.
 *
 * Ce cache permet aux chemins critiques de s'adapter au schema reel plutot que
 * d'echouer. Il ne remplace pas les migrations : il evite qu'une migration
 * manquante se traduise par une perte d'argent ou une panne silencieuse.
 */
const colonnesParTable = new Map<string, Set<string>>();

export async function getColonnes(table: string): Promise<Set<string>> {
  const cache = colonnesParTable.get(table);
  if (cache) return cache;

  const result = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );

  const colonnes = new Set<string>(
    result.rows.map((r: { column_name: string }) => r.column_name)
  );
  colonnesParTable.set(table, colonnes);
  return colonnes;
}

/** True si toutes les colonnes demandees existent. */
export async function aToutesLesColonnes(
  table: string,
  requises: string[]
): Promise<boolean> {
  const colonnes = await getColonnes(table);
  return requises.every((c) => colonnes.has(c));
}

/** Ne conserve que les colonnes qui existent reellement. */
export async function filtrerColonnes(
  table: string,
  souhaitees: string[]
): Promise<string[]> {
  const colonnes = await getColonnes(table);
  return souhaitees.filter((c) => colonnes.has(c));
}

/** Vide le cache d'introspection, a appeler apres une migration. */
export function invaliderCacheColonnes(): void {
  colonnesParTable.clear();
}

/**
 * Execute a function within a database transaction.
 * Automatically commits on success, rolls back on error.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
