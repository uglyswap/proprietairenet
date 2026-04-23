/**
 * Service d'enrichissement immobilier
 * Croise les données DVF, BDNB et Copro pour enrichir les résultats de recherche
 */

import { Pool } from 'pg';

// Pool dédié vers la base immo_data (enrichissement)
const enrichPool = new Pool({
  host: process.env.ENRICH_DB_HOST || '172.17.0.1',
  port: parseInt(process.env.ENRICH_DB_PORT || '5434'),
  database: 'immo_data',
  user: process.env.ENRICH_DB_USER || 'immo',
  password: process.env.ENRICH_DB_PASSWORD || 'imm0_pr0d_2026_s3cure',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/**
 * Enrichit un batch de parcelles avec les données DVF, BDNB et Copro
 */
export async function enrichParcelles(parcelleIds: string[]): Promise<Map<string, any>> {
  if (parcelleIds.length === 0) return new Map();

  const unique = [...new Set(parcelleIds)];
  const client = await enrichPool.connect();
  const results = new Map<string, any>();

  try {
    // Requête unique avec CTE pour tout récupérer en un seul appel
    const query = `
      WITH input_parcelles AS (
        SELECT unnest($1::text[]) as parcelle_id
      ),
      -- DVF : dernière transaction (prix/m² = dernière vente, pas la moyenne)
      dvf_last AS (
        SELECT DISTINCT ON (id_parcelle)
          id_parcelle,
          (valeur_fonciere / NULLIF(surface_reelle_bati, 0))::int as prix_m2,
          surface_reelle_bati::int as surface_batie,
          date_mutation::text as derniere_transaction,
          type_local,
          valeur_fonciere,
          lot1_surface_carrez, lot2_surface_carrez, lot3_surface_carrez,
          lot4_surface_carrez, lot5_surface_carrez
        FROM dvf.mutations 
        WHERE id_parcelle = ANY($1)
          AND valeur_fonciere > 0
          AND surface_reelle_bati > 0
          AND code_type_local != 3
        ORDER BY id_parcelle, date_mutation DESC, valeur_fonciere DESC
      ),
      -- DVF : nombre total de transactions par parcelle
      dvf_count AS (
        SELECT id_parcelle, COUNT(*) as nb_transactions, MIN(date_mutation)::text as premiere_transaction
        FROM dvf.mutations 
        WHERE id_parcelle = ANY($1) AND valeur_fonciere > 0
        GROUP BY id_parcelle
      ),
      -- DVF combiné
      dvf_agg AS (
        SELECT 
          dl.id_parcelle,
          dl.prix_m2,
          dl.surface_batie,
          dl.derniere_transaction,
          dc.nb_transactions,
          dc.premiere_transaction,
          dl.type_local,
          COALESCE(dl.lot1_surface_carrez, 0) + COALESCE(dl.lot2_surface_carrez, 0) + 
          COALESCE(dl.lot3_surface_carrez, 0) + COALESCE(dl.lot4_surface_carrez, 0) + 
          COALESCE(dl.lot5_surface_carrez, 0) as surface_lots_carrez
        FROM dvf_last dl
        LEFT JOIN dvf_count dc ON dc.id_parcelle = dl.id_parcelle
      ),
      -- BDNB : infos bâtiment via parcelle
      bdnb_data AS (
        SELECT DISTINCT ON (rbgp.parcelle_id)
          rbgp.parcelle_id,
          ffo.usage_niveau_1_txt,
          ffo.nb_log,
          ffo.nb_niveau,
          ffo.annee_construction,
          ffo.mat_mur_txt,
          ffo.mat_toit_txt,
          rnc.nb_lot_tot,
          rnc.nb_lot_tertiaire,
          rnc.l_nom_copro,
          rnc.numero_immat_principal
        FROM bdnb_2025_07_a_open_data.rel_batiment_groupe_parcelle rbgp
        LEFT JOIN bdnb_2025_07_a_open_data.batiment_groupe_ffo_bat ffo 
          ON ffo.batiment_groupe_id = rbgp.batiment_groupe_id
        LEFT JOIN bdnb_2025_07_a_open_data.batiment_groupe_rnc rnc 
          ON rnc.batiment_groupe_id = rbgp.batiment_groupe_id
        WHERE rbgp.parcelle_id = ANY($1)
        ORDER BY rbgp.parcelle_id, ffo.nb_log DESC NULLS LAST
      ),
      -- Copro officiel (registre national)
      copro_data AS (
        SELECT DISTINCT ON (reference_cadastrale_1)
          reference_cadastrale_1 as parcelle_id,
          nom_d_usage_de_la_copropriete as nom_copro,
          nb_lot_total,
          nb_lot_habitation,
          nb_lot_tertiaire,
          annee_construction,
          nb_niveau,
          nb_logements
        FROM copro.copro
        WHERE reference_cadastrale_1 = ANY($1)
      ),
      -- Surface parcelle cadastrale
      surface_parcelle AS (
        SELECT DISTINCT ON (idu)
          idu as parcelle_id,
          (st_area(geom))::int as surface_parcelle_m2
        FROM cadastre_geo.parcelles_cadastre
        WHERE idu = ANY($1)
      )
      SELECT 
        ip.parcelle_id,
        d.prix_m2,
        d.surface_batie,
        d.derniere_transaction,
        d.nb_transactions,
        d.premiere_transaction,
        d.type_local,
        d.surface_lots_carrez,
        b.usage_niveau_1_txt as type_bien,
        b.nb_log,
        b.nb_niveau as nb_niveaux_bdnb,
        b.annee_construction as annee_construction_bdnb,
        b.mat_mur_txt,
        b.mat_toit_txt,
        b.nb_lot_tot,
        b.nb_lot_tertiaire,
        b.l_nom_copro,
        b.numero_immat_principal,
        c.nom_copro,
        c.nb_lot_total,
        c.nb_lot_habitation,
        c.nb_lot_tertiaire as copro_nb_lot_tertiaire,
        c.annee_construction as copro_annee_construction,
        c.nb_niveau as copro_nb_niveau,
        c.nb_logements,
        sp.surface_parcelle_m2
      FROM input_parcelles ip
      LEFT JOIN dvf_agg d ON d.id_parcelle = ip.parcelle_id
      LEFT JOIN bdnb_data b ON b.parcelle_id = ip.parcelle_id
      LEFT JOIN copro_data c ON c.parcelle_id = ip.parcelle_id
      LEFT JOIN surface_parcelle sp ON sp.parcelle_id = ip.parcelle_id
    `;

    const result = await client.query(query, [unique]);

    for (const row of result.rows) {
      const pid = row.parcelle_id;
      if (!pid) continue;

      const estCopro = !!(row.nb_lot_tot || row.nb_lot_total || row.l_nom_copro || row.nom_copro);

      results.set(pid, {
        type_bien: row.type_bien || null,
        surface_parcelle: row.surface_parcelle_m2 || null,
        surface_batie: row.surface_batie || null,
        prix_m2: row.prix_m2 || null,
        date_derniere_transaction: row.derniere_transaction || null,
        nb_transactions: row.nb_transactions ? parseInt(row.nb_transactions) : 0,
        est_copropriete: estCopro,
        nb_lots_total: row.nb_lot_total || row.nb_lot_tot || null,
        nb_lots_habitation: row.nb_lot_habitation || null,
        nb_lots_tertiaire: row.copro_nb_lot_tertiaire || row.nb_lot_tertiaire || null,
        nom_copropriete: row.nom_copro || row.l_nom_copro || null,
        annee_construction: row.copro_annee_construction || row.annee_construction_bdnb || null,
        nb_niveaux: row.copro_nb_niveau || row.nb_niveaux_bdnb || null,
        nb_logements: row.nb_logements || row.nb_log || null,
        surface_lots_carrez: row.surface_lots_carrez || null,
        type_transaction: row.type_local || null,
        valeur_fonciere: null,
        premiere_transaction: row.premiere_transaction || null,
      });
    }
  } catch (error) {
    console.error('[ENRICH] Erreur enrichissement:', error);
  } finally {
    client.release();
  }

  return results;
}

/**
 * Enrichit une seule parcelle
 */
export async function enrichParcelle(parcelleId: string): Promise<any | null> {
  const results = await enrichParcelles([parcelleId]);
  return results.get(parcelleId) || null;
}
