/**
 * Normalisation des donnees d'enrichissement de parcelle.
 *
 * POURQUOI UN NORMALISEUR
 *
 * Le backend a change de contrat : il expose desormais `surface_parcelle_m2`,
 * un objet `derniere_vente` et un tableau `ventes`, la ou il exposait
 * `surface_parcelle`, `prix_m2` et `date_derniere_transaction` a plat.
 *
 * Le frontend et le backend etant deployes separement, les deux formats
 * coexistent forcement pendant un temps. Lire directement les nouveaux noms
 * faisait ressortir un enrichissement ENTIEREMENT VIDE face a un backend
 * anterieur, ce qui vidait aussi les filtres de recherche, sans aucun message.
 *
 * Ce module accepte les deux formes et produit une structure unique. Il est le
 * seul endroit du frontend qui connait les noms de champs du backend.
 */

export interface VenteNormalisee {
  date: string | null;
  prix: number | null;
  nature: string | null;
  type_local: string | null;
  surface_bati: number | null;
  surface_terrain: number | null;
  prix_m2_bati: number | null;
  prix_m2_terrain: number | null;
  nombre_pieces: number | null;
  foncier_nu: boolean;
  /** True quand le prix DVF couvre plusieurs parcelles, donc non imputable. */
  prix_partage: boolean;
}

export interface EnrichissementNormalise {
  surface_parcelle: number | null;
  surface_geometrique: number | null;
  derniere_vente: VenteNormalisee | null;
  date_derniere_transaction: string | null;
  prix_derniere_vente: number | null;
  prix_m2: number | null;
  surface_batie: number | null;
  surface_lots_carrez: number | null;
  type_transaction: string | null;
  historique_ventes: Array<{
    date: string | null;
    prix: number | null;
    nature: string | null;
    type_local: string | null;
    prix_m2: number | null;
  }>;
  nb_transactions: number;
  premiere_transaction: string | null;
  type_bien: string | null;
  annee_construction: number | null;
  nb_niveaux: number | null;
  nb_logements: number | null;
  materiau_mur: string | null;
  materiau_toit: string | null;
  est_copropriete: boolean;
  nom_copropriete: string | null;
  nb_lots_total: number | null;
  nb_lots_habitation: number | null;
  nb_lots_tertiaire: number | null;
  nb_lots_stationnement: number | null;
  foncier_nu: boolean;
  sources: { dvf: boolean; bdnb: boolean; copro: boolean; cadastre: boolean } | null;
  /** 'complet' pour le contrat courant, 'ancien' pour un backend anterieur. */
  format_source: 'complet' | 'ancien';
}

/** Conversion tolerante : le pilote pg renvoie les numeric en chaine. */
function nombre(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : null;
}

function texte(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const t = valeur.trim();
  return t === '' ? null : t;
}

/** Ramene une date a sa forme AAAA-MM-JJ sans conversion de fuseau. */
export function dateIso(valeur: unknown): string | null {
  if (!valeur) return null;
  const s = String(valeur);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normaliserVente(v: any): VenteNormalisee | null {
  if (!v) return null;
  return {
    date: dateIso(v.date_mutation ?? v.date),
    prix: nombre(v.valeur_fonciere ?? v.prix),
    nature: texte(v.nature_mutation ?? v.nature),
    type_local: texte(v.type_local),
    surface_bati: nombre(v.surface_bati_m2 ?? v.surface_bati),
    surface_terrain: nombre(v.surface_terrain_m2 ?? v.surface_terrain),
    prix_m2_bati: nombre(v.prix_m2_bati),
    prix_m2_terrain: nombre(v.prix_m2_terrain),
    nombre_pieces: nombre(v.nombre_pieces),
    foncier_nu: Boolean(v.foncier_nu),
    prix_partage: Boolean(v.prix_couvre_plusieurs_parcelles ?? v.prix_partage),
  };
}

/**
 * Normalise une entree d'enrichissement, quelle que soit la version du backend.
 * Retourne null si l'entree est vide.
 */
export function normaliserEnrichissement(brut: any): EnrichissementNormalise | null {
  if (!brut || typeof brut !== 'object') return null;

  // Le contrat courant se reconnait a la presence de `surface_parcelle_m2` ou
  // d'un objet `derniere_vente`.
  const estFormatComplet =
    'surface_parcelle_m2' in brut || 'derniere_vente' in brut || 'ventes' in brut;

  const derniereVente = estFormatComplet
    ? normaliserVente(brut.derniere_vente)
    : normaliserVente({
        // Reconstitution depuis l'ancienne forme a plat. `valeur_fonciere`
        // n'existait pas : le prix de la derniere vente etait calcule par le
        // backend puis jete, il est donc structurellement absent ici.
        date: brut.date_derniere_transaction,
        prix: brut.prix_derniere_vente ?? null,
        type_local: brut.type_transaction,
        surface_bati: brut.surface_batie,
        prix_m2_bati: brut.prix_m2,
      });

  const historique = Array.isArray(brut.ventes)
    ? brut.ventes.map((v: any) => {
        const n = normaliserVente(v);
        return {
          date: n?.date ?? null,
          prix: n?.prix ?? null,
          nature: n?.nature ?? null,
          type_local: n?.type_local ?? null,
          prix_m2: n?.prix_m2_bati ?? n?.prix_m2_terrain ?? null,
        };
      })
    : Array.isArray(brut.historique_ventes)
      ? brut.historique_ventes
      : [];

  return {
    surface_parcelle: nombre(brut.surface_parcelle_m2 ?? brut.surface_parcelle),
    surface_geometrique: nombre(brut.surface_geometrique_m2 ?? brut.surface_geometrique),
    derniere_vente: derniereVente,
    date_derniere_transaction: derniereVente?.date ?? dateIso(brut.date_derniere_transaction),
    prix_derniere_vente: derniereVente?.prix ?? null,
    prix_m2:
      derniereVente?.prix_m2_bati ??
      derniereVente?.prix_m2_terrain ??
      nombre(brut.prix_m2),
    surface_batie: derniereVente?.surface_bati ?? nombre(brut.surface_batie),
    surface_lots_carrez: nombre(brut.surface_lots_carrez),
    type_transaction: derniereVente?.type_local ?? texte(brut.type_transaction),
    historique_ventes: historique,
    nb_transactions: nombre(brut.nb_transactions) ?? 0,
    premiere_transaction: dateIso(brut.premiere_transaction),
    type_bien: texte(brut.type_bien),
    annee_construction: nombre(brut.annee_construction),
    nb_niveaux: nombre(brut.nb_niveaux),
    nb_logements: nombre(brut.nb_logements),
    materiau_mur: texte(brut.materiau_mur),
    materiau_toit: texte(brut.materiau_toit),
    est_copropriete: Boolean(brut.est_copropriete),
    nom_copropriete: texte(brut.nom_copropriete),
    nb_lots_total: nombre(brut.nb_lots_total),
    nb_lots_habitation: nombre(brut.nb_lots_habitation),
    nb_lots_tertiaire: nombre(brut.nb_lots_tertiaire),
    nb_lots_stationnement: nombre(brut.nb_lots_stationnement),
    foncier_nu: Boolean(brut.foncier_nu),
    sources: brut.sources ?? null,
    format_source: estFormatComplet ? 'complet' : 'ancien',
  };
}

/**
 * Choisit la parcelle representative d'un proprietaire : vente la plus recente,
 * a defaut la plus grande surface. Retenir la premiere du tableau, comme le
 * faisait le code precedent, designait une parcelle arbitraire.
 */
export function choisirParcellePrincipale(
  candidats: EnrichissementNormalise[]
): EnrichissementNormalise | null {
  if (candidats.length === 0) return null;
  return candidats.reduce((meilleur, courant) => {
    const dM = meilleur.derniere_vente?.date || '';
    const dC = courant.derniere_vente?.date || '';
    if (dC !== dM) return dC > dM ? courant : meilleur;
    return (courant.surface_parcelle || 0) > (meilleur.surface_parcelle || 0)
      ? courant
      : meilleur;
  });
}
