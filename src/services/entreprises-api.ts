/**
 * Service de recherche d'entreprises
 * 
 * v2.6.0 - 2026-04-23
 * - Migration de l'API externe vers la DB locale SIRENE (29M+ unités légales)
 * - Cache en mémoire avec TTL pour les résultats
 * - Fallback vers API externe si DB locale ne retourne rien
 */

import { Pool } from 'pg';
import { config } from '../config/index.js';
import axios from 'axios';
import { EntrepriseEnrichie, Dirigeant, SiegeEntreprise, BeneficiaireEffectif } from '../types/index.js';

// Pool de connexion à la DB SIRENE locale
let sirenePool: Pool | null = null;

function getSirenePool(): Pool {
  if (!sirenePool) {
    sirenePool = new Pool({
      host: process.env.SIRENE_DB_HOST || '172.17.0.1',
      port: parseInt(process.env.SIRENE_DB_PORT || '5434'),
      database: 'sirene',
      user: process.env.SIRENE_DB_USER || 'immo',
      password: process.env.SIRENE_DB_PASSWORD || 'imm0_pr0d_2026_s3cure',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return sirenePool;
}

// Cache en mémoire avec TTL (7 jours)
interface CacheEntry {
  data: EntrepriseEnrichie | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const entreprisesCache = new Map<string, CacheEntry>();

// Track consecutive 429 errors to enable fallback mode
let consecutive429s = 0;
const FALLBACK_THRESHOLD = 3;
let fallbackMode = false;
let lastFallbackCheck = 0;
const FALLBACK_CHECK_INTERVAL = 5 * 60 * 1000;

// Configuration pour la résolution des bénéficiaires effectifs
const MAX_DEPTH = 5;

// Rate limiter simple pour l'API externe (backup)
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number, windowMs: number = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldestTs = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestTs) + 10;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot();
    }
    this.timestamps.push(now);
  }
}

const rateLimiter = new RateLimiter(config.entreprisesApi.maxRequestsPerSecond);
const externalClient = axios.create({
  baseURL: config.entreprisesApi.baseUrl,
  timeout: config.entreprisesApi.timeout,
  headers: { 'Accept': 'application/json' },
});

/**
 * Recherche une entreprise par SIREN dans la DB locale
 */
async function searchBySirenLocal(siren: string): Promise<EntrepriseEnrichie | null> {
  if (!siren || siren.length !== 9) return null;

  const pool = getSirenePool();
  
  try {
    const result = await pool.query(
      `SELECT 
        siren, denomination, sigle, forme_juridique_code,
        categorie_entreprise, tranche_effectif, annee_effectifs,
        etat_administratif, date_creation, caractere_employeur,
        activite_principale, nomenclature_activite
       FROM unite_legale 
       WHERE siren = $1 
       LIMIT 1`,
      [siren]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return mapRowToEntreprise(row);
  } catch (error) {
    console.error(`[SIRENE-LOCAL] Erreur recherche SIREN ${siren}:`, error);
    return null;
  }
}

/**
 * Recherche une entreprise par dénomination dans la DB locale
 */
async function searchByDenominationLocal(denomination: string, limit: number = 5): Promise<EntrepriseEnrichie[]> {
  if (!denomination || denomination.trim().length < 2) return [];

  const pool = getSirenePool();
  
  try {
    // Recherche full-text sur la dénomination
    const searchTerms = denomination.trim().split(/\s+/).filter(t => t.length > 2);
    
    if (searchTerms.length === 0) {
      // Fallback: recherche LIKE
      const result = await pool.query(
        `SELECT siren, denomination, sigle, forme_juridique_code,
                categorie_entreprise, tranche_effectif, annee_effectifs,
                etat_administratif, date_creation, caractere_employeur,
                activite_principale, nomenclature_activite
         FROM unite_legale
         WHERE etat_administratif = 'A'
           AND denomination IS NOT NULL
           AND denomination != ''
           AND LOWER(denomination) LIKE LOWER($1)
         ORDER BY ts_rank(to_tsvector('simple', COALESCE(denomination, '')), plainto_tsquery('simple', $2)) DESC
         LIMIT $3`,
        [`%${denomination.trim()}%`, searchTerms.join(' & '), limit]
      );
      return result.rows.map(mapRowToEntreprise);
    }

    // Recherche full-text
    const query = searchTerms.join(' & ');
    const result = await pool.query(
      `SELECT siren, denomination, sigle, forme_juridique_code,
              categorie_entreprise, tranche_effectif, annee_effectifs,
              etat_administratif, date_creation, caractere_employeur,
              activite_principale, nomenclature_activite,
              ts_rank(to_tsvector('simple', COALESCE(denomination, '')), plainto_tsquery('simple', $1)) as score
       FROM unite_legale
       WHERE etat_administratif = 'A'
         AND denomination IS NOT NULL
         AND denomination != ''
         AND to_tsvector('simple', COALESCE(denomination, '')) @@ plainto_tsquery('simple', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [query, limit]
    );

    if (result.rows.length === 0) {
      // Fallback: recherche LIKE
      const likeResult = await pool.query(
        `SELECT siren, denomination, sigle, forme_juridique_code,
                categorie_entreprise, tranche_effectif, annee_effectifs,
                etat_administratif, date_creation, caractere_employeur,
                activite_principale, nomenclature_activite
         FROM unite_legale
         WHERE etat_administratif = 'A'
           AND denomination IS NOT NULL
           AND denomination != ''
           AND LOWER(denomination) LIKE LOWER($1)
         LIMIT $2`,
        [`%${denomination.trim()}%`, limit]
      );
      return likeResult.rows.map(mapRowToEntreprise);
    }

    return result.rows.map(mapRowToEntreprise);
  } catch (error) {
    console.error(`[SIRENE-LOCAL] Erreur recherche dénomination "${denomination}":`, error);
    return [];
  }
}

/**
 * Map une ligne de la DB vers le type EntrepriseEnrichie
 */
function mapRowToEntreprise(row: any): EntrepriseEnrichie {
  const trancheEffectifLabels: Record<string, string> = {
    '00': '0 salarié', '01': '1 ou 2 salariés', '02': '3 à 5 salariés',
    '03': '6 à 9 salariés', '11': '10 à 19 salariés', '12': '20 à 49 salariés',
    '21': '50 à 99 salariés', '22': '100 à 199 salariés', '31': '200 à 249 salariés',
    '32': '250 à 499 salariés', '41': '500 à 999 salariés', '42': '1000 à 1999 salariés',
    '51': '2000 à 4999 salariés', '52': '5000 à 9999 salariés', '53': '10000 salariés et plus',
  };

  return {
    siren: row.siren || '',
    nom_complet: row.denomination || `Entreprise ${row.siren}`,
    nom_raison_sociale: row.denomination || '',
    sigle: row.sigle || null,
    nature_juridique: decodeFormeJuridique(row.forme_juridique_code),
    date_creation: row.date_creation || '',
    etat_administratif: row.etat_administratif || 'inconnu',
    categorie_entreprise: row.categorie_entreprise || '',
    tranche_effectif: trancheEffectifLabels[row.tranche_effectif] || 'Non renseigné',
    siege: { adresse: '', code_postal: '', commune: '' },
    dirigeants: [],
    beneficiaires_effectifs: [],
    nombre_etablissements: 0,
  };
}

function decodeFormeJuridique(code: string): string {
  if (!code) return '';
  const formes: Record<string, string> = {
    '1000': 'Entrepreneur individuel',
    '2110': 'Indivision entre personnes physiques',
    '2210': 'Indivision avec personne morale',
    '2385': 'Groupement de coopération internationale',
    '3110': 'Reconnu association',
    '4110': 'SA à conseil d\'administration',
    '4120': 'SA à directoire',
    '4130': 'SA à conseil de surveillance',
    '4140': 'SA à conseil d\'administration (banques)',
    '4150': 'SA à directoire (banques)',
    '5195': 'Société de fait',
    '5410': 'SARL nationale',
    '5415': 'SARL d\'économie mixte',
    '5422': 'SARL immobilière pour le commerce et l\'industrie',
    '5426': 'SARL immobilière de gestion',
    '5430': 'SARL d\'aménagement foncier et d\'équipement rural',
    '5431': 'SARL d\'exploitation agricole',
    '5442': 'SARL de participations de professions libérales',
    '5451': 'SARL de constructeurs',
    '5460': 'SARL de crédit',
    '5470': 'SARL de vente',
    '5485': 'SARL de services',
    '5497': 'Autre SARL',
    '5498': 'SARL non spécifiée',
    '5499': 'Autre société à responsabilité limitée',
    '5505': 'SA à participation ouvrière à directoire',
    '5510': 'SA à participation ouvrière à conseil d\'administration',
    '5605': 'SAS',
    '5610': 'SA à directoire à participation ouvrière',
    '5700': 'SAS non cotée',
    '5710': 'SAS cotée',
    '5800': 'Société européenne',
    '6100': 'Caisse d\'épargne et de prévoyance',
    '6210': 'Coopérative d\'utilisation de matériel agricole',
    '6220': 'Société coopérative artisanale',
    '6310': 'Coopérative de consommation',
    '6316': 'Coopérative de commerçants-détaillants',
    '6411': 'Société d\'assurances mutuelles',
    '6510': 'Société civile de placement collectif immobilier',
    '6511': 'Société civile de trésorerie',
    '6521': 'Société civile de construction-vente',
    '6532': 'Société civile d\'exploitation minière',
    '6533': 'Société civile forestière',
    '6534': 'Société civile d\'intérêt collectif agricole',
    '6535': 'Société civile d\'accession progressive à la propriété',
    '6536': 'Société civile immobilière',
    '6537': 'Société civile immobilière de construction-vente',
    '6538': 'Société civile de copropriété des navires',
    '6539': 'Autre société civile immobilière',
    '6540': 'Société civile immobilière (SCI)',
    '6542': 'Société civile de placement collectif immobilier',
    '6544': 'Société civile de moyens',
    '6551': 'Société civile professionnelle',
    '6554': 'Société civile de soins',
    '6558': 'Société civile professionnelle d\'avocats',
    '6560': 'Société civile de gestion de droits sociaux',
    '6561': 'Société civile de gestion de portefeuille',
    '6585': 'Société civile de copropriété',
    '6588': 'Société civile de distribution',
    '6589': 'Société civile de services',
    '6598': 'Société civile non spécifiée',
    '6599': 'Autre société civile',
    '7111': 'Syndicat de propriétaires',
    '7112': 'Association syndicale autorisée',
    '7113': 'Association foncière urbaine',
    '7114': 'Association foncière de remembrement',
    '7120': 'Syndicat des commissaires et directeurs de copropriété',
    '7210': 'Condominium',
    '7220': 'Syndicat de copropriété',
    '7331': 'Établissement public national de recherche',
    '7340': 'Établissement public national d\'enseignement',
    '7349': 'Autre établissement public national d\'enseignement',
    '7350': 'Établissement public national à caractère administratif',
    '7360': 'Établissement public local d\'enseignement',
    '7361': 'Établissement public local d\'enseignement et de formation professionnelle agricoles',
    '7362': 'Établissement public hospitalier',
    '7363': 'Établissement public à caractère administratif',
    '7370': 'Établissement public national à caractère industriel et commercial',
    '7371': 'Établissement public local à caractère industriel et commercial',
    '7372': 'Établissement public local d\'habitation',
    '7373': 'Régie d\'équipement rural',
    '7378': 'Établissement public à caractère industriel et commercial (EPIC)',
    '7379': 'Autre établissement public',
    '7380': 'Établissement public à caractère scientifique, culturel et professionnel',
    '7381': 'Établissement public à caractère scientifique et technologique',
    '7382': 'Établissement public à caractère administratif (EP)',
    '7383': 'Établissement public local',
    '7384': 'Établissement public national',
    '7385': 'Groupement d\'intérêt public',
    '7410': 'Groupement d\'intérêt économique',
    '7450': 'Société de groupe d\'assurances mutuelles',
    '7451': 'Fonds commun de créances',
    '7460': 'Société de participations financières de professions libérales',
    '7470': 'Société holding',
    '7480': 'Société de participations financières',
    '7485': 'Société de participations financières de professions libérales',
    '7489': 'Autre société de participations financières',
    '7490': 'Autre groupement de droit privé non doté de la personnalité morale',
    '7499': 'Autre personne morale de droit inscrite au RCS',
    '8110': 'Régime général de la Sécurité Sociale',
    '8120': 'Régime spécial de Sécurité Sociale',
    '8130': 'Institution de retraite complémentaire',
    '8140': 'Mutuelle',
    '8150': 'Institution de prévoyance',
    '8160': 'Institution de retraite supplémentaire',
    '8170': 'Régime de retraite additionnelle',
    '8190': 'Autre régime de sécurité sociale',
    '8210': 'Banque de France',
    '8250': 'Établissement public national de crédit',
    '8260': 'Société de financement',
    '8270': 'Fonds commun de titrisation',
    '8291': 'Établissement de crédit à long terme',
    '8310': 'Établissement public de crédit',
    '8410': 'Régime général de la Sécurité Sociale',
    '8420': 'Régime spécial de Sécurité Sociale',
    '8430': 'Institution de retraite complémentaire',
    '8440': 'Mutuelle',
    '8450': 'Institution de prévoyance',
    '8490': 'Autre organisme de sécurité sociale',
    '9110': 'Syndicat de propriétaires',
    '9150': 'Syndicat de copropriété',
    '9160': 'Association syndicale autorée',
    '9210': 'Association loi 1901',
    '9220': 'Association déclarée',
    '9221': 'Association déclarée inscrite',
    '9222': 'Association préfecture',
    '9223': 'Association sous-préfecture',
    '9224': 'Association sous-préfecture',
    '9230': 'Fondation',
    '9240': 'Association de droit local (Bas-Rhin, Haut-Rhin, Moselle)',
    '9260': 'Congrégation',
    '9270': 'Association de fait',
    '9310': 'Personne morale étrangère de type association',
    '9320': 'Personne morale étrangère de type fondation',
    '9900': 'Autre personne morale de droit privé',
    '9999': 'Autre personne morale inscrite au RCS',
  };
  
  // Retourner le code avec la description si trouvée
  return formes[code] || `Forme juridique: ${code}`;
}

/**
 * Vérifie le cache pour un SIREN donné
 */
function getFromCache(siren: string): EntrepriseEnrichie | null | undefined {
  const entry = entreprisesCache.get(siren);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    entreprisesCache.delete(siren);
    return undefined;
  }
  return entry.data;
}

function setCache(siren: string, data: EntrepriseEnrichie | null): void {
  entreprisesCache.set(siren, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Fallback vers l'API externe (si la DB locale ne retourne rien)
 */
async function searchBySirenExternal(siren: string): Promise<EntrepriseEnrichie | null> {
  if (!siren || siren.length !== 9) return null;

  if (fallbackMode) {
    console.log(`[SIRENE] Fallback mode - résultat basique pour SIREN ${siren}`);
    return {
      siren, nom_complet: `Entreprise ${siren}`, nom_raison_sociale: '', sigle: null,
      nature_juridique: '', date_creation: '', etat_administratif: 'inconnu',
      categorie_entreprise: '', tranche_effectif: 'Non renseigné',
      siege: { adresse: '', code_postal: '', commune: '' },
      dirigeants: [], beneficiaires_effectifs: [], nombre_etablissements: 0,
    };
  }

  await rateLimiter.waitForSlot();

  try {
    const response = await externalClient.get('/search', {
      params: { q: siren, per_page: 1 },
    });

    consecutive429s = 0;
    const results = response.data?.results;
    if (!results || results.length === 0) {
      setCache(siren, null);
      return null;
    }

    const enriched = await mapToEntrepriseEnrichieExternal(results[0]);
    setCache(siren, enriched);
    return enriched;
  } catch (error: any) {
    if (error?.response?.status === 429) {
      consecutive429s++;
      if (consecutive429s >= FALLBACK_THRESHOLD) {
        fallbackMode = true;
        lastFallbackCheck = Date.now();
        console.warn('[SIRENE] ⚠️ Mode fallback activé - API externe rate-limitée');
      }
      return null;
    }
    console.error(`[SIRENE-EXTERNAL] Erreur pour SIREN ${siren}:`, error);
    return null;
  }
}

async function mapToEntrepriseEnrichieExternal(data: any): Promise<EntrepriseEnrichie> {
  return {
    siren: data.siren || '',
    nom_complet: data.nom_complet || '',
    nom_raison_sociale: data.nom_raison_sociale || '',
    sigle: data.sigle || null,
    nature_juridique: data.nature_juridique || '',
    date_creation: data.date_creation || '',
    etat_administratif: data.etat_administratif || '',
    categorie_entreprise: data.categorie_entreprise || '',
    tranche_effectif: decodeTrancheEffectifExternal(data.tranche_effectif_salarie),
    siege: mapSiegeExternal(data.siege || {}),
    dirigeants: extractDirigeantsExternal(data),
    beneficiaires_effectifs: [],
    nombre_etablissements: data.nombre_etablissements_ouverts || 0,
  };
}

function decodeTrancheEffectifExternal(code: string): string {
  const tranches: Record<string, string> = {
    '00': '0 salarié', '01': '1 ou 2 salariés', '02': '3 à 5 salariés',
    '03': '6 à 9 salariés', '11': '10 à 19 salariés', '12': '20 à 49 salariés',
    '21': '50 à 99 salariés', '22': '100 à 199 salariés', '31': '200 à 249 salariés',
    '32': '250 à 499 salariés', '41': '500 à 999 salariés', '42': '1000 à 1999 salariés',
    '51': '2000 à 4999 salariés', '52': '5000 à 9999 salariés', '53': '10000 salariés et plus',
  };
  return tranches[code] || 'Non renseigné';
}

function mapSiegeExternal(siege: any): SiegeEntreprise {
  const adresseParts = [siege.numero_voie, siege.type_voie, siege.libelle_voie].filter(Boolean);
  return {
    adresse: adresseParts.join(' ') || '',
    code_postal: siege.code_postal || '',
    commune: siege.libelle_commune || '',
    latitude: siege.latitude?.toString() || undefined,
    longitude: siege.longitude?.toString() || undefined,
  };
}

function extractDirigeantsExternal(data: any): Dirigeant[] {
  const dirigeants: Dirigeant[] = [];
  if (data.dirigeants) {
    for (const d of data.dirigeants) {
      if (d.type_dirigeant === 'personne physique') {
        dirigeants.push({
          nom: d.nom || '', prenoms: d.prenoms || '', qualite: d.qualite || '',
          type: 'personne_physique', annee_naissance: d.annee_de_naissance?.toString() || undefined,
        });
      } else if (d.type_dirigeant === 'personne morale') {
        dirigeants.push({
          nom: d.denomination || '', prenoms: '', qualite: d.qualite || '',
          type: 'personne_morale', siren: d.siren || undefined, denomination: d.denomination || undefined,
        });
      }
    }
  }
  return dirigeants;
}

// ============================================================================
// API Publique - Utilisée par le reste de l'application
// ============================================================================

/**
 * Recherche une entreprise par SIREN
 * Priorité: 1. Cache → 2. DB locale → 3. API externe (fallback)
 */
export async function enrichSiren(siren: string): Promise<EntrepriseEnrichie | null> {
  if (!siren || siren.length !== 9) return null;

  // 1. Vérifier le cache
  const cached = getFromCache(siren);
  if (cached !== undefined) return cached;

  // 2. DB locale SIRENE
  const local = await searchBySirenLocal(siren);
  if (local) {
    setCache(siren, local);
    return local;
  }

  // 3. Fallback API externe
  console.log(`[SIRENE] SIREN ${siren} non trouvé en DB locale, fallback API externe`);
  const external = await searchBySirenExternal(siren);
  if (external) setCache(siren, external);
  return external;
}

/**
 * Recherche une entreprise par dénomination
 * Priorité: 1. DB locale → 2. API externe (fallback)
 */
export async function searchEntreprises(denomination: string, limit?: number): Promise<EntrepriseEnrichie[]> {
  if (!denomination || denomination.trim().length < 2) return [];

  // 1. DB locale SIRENE
  const local = await searchByDenominationLocal(denomination, limit || 5);
  if (local.length > 0) return local;

  // 2. Fallback API externe
  console.log(`[SIRENE] Dénomination "${denomination}" non trouvée en DB locale, fallback API externe`);
  
  if (fallbackMode) {
    return [{
      siren: '', nom_complet: denomination, nom_raison_sociale: denomination, sigle: null,
      nature_juridique: '', date_creation: '', etat_administratif: 'inconnu',
      categorie_entreprise: '', tranche_effectif: 'Non renseigné',
      siege: { adresse: '', code_postal: '', commune: '' },
      dirigeants: [], beneficiaires_effectifs: [], nombre_etablissements: 0,
    }];
  }

  await rateLimiter.waitForSlot();
  try {
    const response = await externalClient.get('/search', {
      params: { q: denomination.trim(), per_page: limit || 5 },
    });
    consecutive429s = 0;
    const results = response.data?.results;
    if (!results || results.length === 0) return [];
    return Promise.all(results.map(r => mapToEntrepriseEnrichieExternal(r)));
  } catch (error: any) {
    if (error?.response?.status === 429) {
      consecutive429s++;
      if (consecutive429s >= FALLBACK_THRESHOLD) {
        fallbackMode = true;
        lastFallbackCheck = Date.now();
      }
      return [];
    }
    console.error(`[SIRENE-EXTERNAL] Erreur pour "${denomination}":`, error);
    return [];
  }
}

/**
 * Stats du cache (pour monitoring)
 */
export function getCacheStats(): { size: number; fallbackMode: boolean; consecutive429s: number } {
  return {
    size: entreprisesCache.size,
    fallbackMode,
    consecutive429s,
  };
}
