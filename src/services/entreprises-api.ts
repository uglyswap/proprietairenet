import axios, { AxiosInstance } from 'axios';
import { config } from '../config/index.js';
import { EntrepriseEnrichie, Dirigeant, SiegeEntreprise, BeneficiaireEffectif } from '../types/index.js';

// Configuration pour la résolution des bénéficiaires effectifs
const MAX_DEPTH = 5; // Profondeur max de résolution des chaînes de PM

// Cache en mémoire avec TTL (7 jours)
interface CacheEntry {
  data: EntrepriseEnrichie | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours
const entreprisesCache = new Map<string, CacheEntry>();

// Track consecutive 429 errors to enable fallback mode
let consecutive429s = 0;
const FALLBACK_THRESHOLD = 3; // Après 3 erreurs 429 consécutives, activer le fallback
let fallbackMode = false;
let lastFallbackCheck = 0;
const FALLBACK_CHECK_INTERVAL = 5 * 60 * 1000; // Vérifier si l'API est revenue toutes les 5 min

// Rate limiter simple pour respecter les 7 req/sec
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

    // Nettoyer les timestamps expirés
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      // Attendre que le plus ancien timestamp expire
      const oldestTs = this.timestamps[0];
      const waitTime = this.windowMs - (now - oldestTs) + 10; // +10ms de marge
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot();
    }

    this.timestamps.push(now);
  }
}

// Client API Entreprises
class EntreprisesApiClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;

  constructor() {
    this.client = axios.create({
      baseURL: config.entreprisesApi.baseUrl,
      timeout: config.entreprisesApi.timeout,
      headers: {
        'Accept': 'application/json',
      },
    });

    this.rateLimiter = new RateLimiter(config.entreprisesApi.maxRequestsPerSecond);
  }

  /**
   * Vérifie si on est en mode fallback et si on peut en sortir
   */
  private checkFallbackMode(): void {
    const now = Date.now();
    
    // Si on est en fallback, vérifier périodiquement si l'API est revenue
    if (fallbackMode && now - lastFallbackCheck > FALLBACK_CHECK_INTERVAL) {
      console.log('[EntreprisesAPI] Vérification si API disponible (sortie du mode fallback)');
      fallbackMode = false;
      consecutive429s = 0;
      lastFallbackCheck = now;
    }
  }

  /**
   * Gère les erreurs 429 et active/désactive le mode fallback
   */
  private handleRateLimitError(siren: string): void {
    consecutive429s++;
    console.warn(`[EntreprisesAPI] Rate limit (429) pour SIREN ${siren} - erreur #${consecutive429s} consécutive`);
    
    if (consecutive429s >= FALLBACK_THRESHOLD && !fallbackMode) {
      fallbackMode = true;
      lastFallbackCheck = Date.now();
      console.warn('[EntreprisesAPI] ⚠️ Mode fallback activé - trop d\'erreurs 429 consécutives');
    }
  }

  /**
   * Réinitialise le compteur d'erreurs après un succès
   */
  private handleSuccess(): void {
    if (consecutive429s > 0) {
      console.log(`[EntreprisesAPI] Succès API - reset du compteur d'erreurs (était à ${consecutive429s})`);
    }
    consecutive429s = 0;
    if (fallbackMode) {
      console.log('[EntreprisesAPI] Sortie du mode fallback - API revenue');
      fallbackMode = false;
    }
  }

  /**
   * Vérifie le cache pour un SIREN donné
   */
  private getFromCache(siren: string): EntrepriseEnrichie | null | undefined {
    const entry = entreprisesCache.get(siren);
    if (!entry) return undefined; // Pas en cache
    
    if (Date.now() > entry.expiresAt) {
      entreprisesCache.delete(siren);
      return undefined; // Expiré
    }
    
    return entry.data;
  }

  /**
   * Stocke un résultat dans le cache
   */
  private setCache(siren: string, data: EntrepriseEnrichie | null): void {
    entreprisesCache.set(siren, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  /**
   * Génère un résultat de fallback basique à partir du SIREN seul
   */
  private createFallbackResult(siren: string): EntrepriseEnrichie {
    return {
      siren,
      nom_complet: `Entreprise ${siren}`,
      nom_raison_sociale: '',
      sigle: null,
      nature_juridique: '',
      date_creation: '',
      etat_administratif: 'inconnu',
      categorie_entreprise: '',
      tranche_effectif: 'Non renseigné',
      siege: { adresse: '', code_postal: '', commune: '' },
      dirigeants: [],
      beneficiaires_effectifs: [],
      nombre_etablissements: 0,
    };
  }

  // Recherche une entreprise par SIREN (avec résolution des bénéficiaires effectifs)
  async searchBySiren(siren: string): Promise<EntrepriseEnrichie | null> {
    if (!siren || siren.length !== 9) return null;

    // 1. Vérifier le cache
    const cached = this.getFromCache(siren);
    if (cached !== undefined) {
      console.log(`[EntreprisesAPI] Cache HIT pour SIREN ${siren}`);
      return cached;
    }

    // 2. Vérifier le mode fallback
    this.checkFallbackMode();
    if (fallbackMode) {
      console.log(`[EntreprisesAPI] Fallback mode - résultat basique pour SIREN ${siren}`);
      const fallback = this.createFallbackResult(siren);
      this.setCache(siren, fallback);
      return fallback;
    }

    // 3. Appel API normal
    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.client.get('/search', {
        params: {
          q: siren,
          per_page: 1,
        },
      });

      this.handleSuccess();

      const results = response.data?.results;
      if (!results || results.length === 0) {
        this.setCache(siren, null);
        return null;
      }

      const enriched = await this.mapToEntrepriseEnrichie(results[0]);
      this.setCache(siren, enriched);
      return enriched;
    } catch (error: any) {
      if (error?.response?.status === 429) {
        this.handleRateLimitError(siren);
        
        // Si on vient de passer en fallback, retourner un résultat basique
        if (fallbackMode) {
          console.log(`[EntreprisesAPI] Activation fallback pour SIREN ${siren}`);
          const fallback = this.createFallbackResult(siren);
          this.setCache(siren, fallback);
          return fallback;
        }
        
        return null;
      }
      
      console.error(`Erreur API Entreprises pour SIREN ${siren}:`, error);
      return null;
    }
  }

  // Recherche une entreprise par dénomination
  async searchByDenomination(denomination: string, limit: number = 5): Promise<EntrepriseEnrichie[]> {
    if (!denomination || denomination.trim().length < 2) return [];

    // En mode fallback, retourner un résultat minimal
    this.checkFallbackMode();
    if (fallbackMode) {
      console.log(`[EntreprisesAPI] Fallback mode - recherche par dénomination "${denomination}"`);
      return [{
        siren: '',
        nom_complet: denomination,
        nom_raison_sociale: denomination,
        sigle: null,
        nature_juridique: '',
        date_creation: '',
        etat_administratif: 'inconnu',
        categorie_entreprise: '',
        tranche_effectif: 'Non renseigné',
        siege: { adresse: '', code_postal: '', commune: '' },
        dirigeants: [],
        beneficiaires_effectifs: [],
        nombre_etablissements: 0,
      }];
    }

    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.client.get('/search', {
        params: {
          q: denomination.trim(),
          per_page: limit,
        },
      });

      this.handleSuccess();

      const results = response.data?.results;
      if (!results || results.length === 0) return [];

      // Mapper chaque résultat avec résolution des bénéficiaires
      const mapped: EntrepriseEnrichie[] = [];
      for (const r of results) {
        mapped.push(await this.mapToEntrepriseEnrichie(r));
      }
      return mapped;
    } catch (error: any) {
      if (error?.response?.status === 429) {
        this.handleRateLimitError('denomination');
        if (fallbackMode) {
          return [{
            siren: '',
            nom_complet: denomination,
            nom_raison_sociale: denomination,
            sigle: null,
            nature_juridique: '',
            date_creation: '',
            etat_administratif: 'inconnu',
            categorie_entreprise: '',
            tranche_effectif: 'Non renseigné',
            siege: { adresse: '', code_postal: '', commune: '' },
            dirigeants: [],
            beneficiaires_effectifs: [],
            nombre_etablissements: 0,
          }];
        }
        return [];
      }
      
      console.error(`Erreur API Entreprises pour "${denomination}":`, error);
      return [];
    }
  }

  // Récupère les dirigeants bruts d'un SIREN (pour la résolution récursive)
  private async fetchDirigeantsRaw(siren: string): Promise<any[]> {
    if (!siren || siren.length !== 9) return [];

    // En mode fallback, pas de dirigeants
    if (fallbackMode) return [];

    await this.rateLimiter.waitForSlot();

    try {
      const response = await this.client.get('/search', {
        params: {
          q: siren,
          per_page: 1,
        },
      });

      this.handleSuccess();

      const results = response.data?.results;
      if (!results || results.length === 0) return [];

      return results[0].dirigeants || [];
    } catch (error: any) {
      if (error?.response?.status === 429) {
        this.handleRateLimitError(siren);
        return [];
      }
      
      console.error(`Erreur récupération dirigeants pour SIREN ${siren}:`, error);
      return [];
    }
  }

  // Résout récursivement les bénéficiaires effectifs (personnes physiques finales)
  private async resolveBeneficiairesEffectifs(
    dirigeantsRaw: any[],
    chaineActuelle: Array<{ siren: string; denomination: string; qualite: string }>,
    sirensVisites: Set<string>,
    profondeur: number
  ): Promise<BeneficiaireEffectif[]> {
    const beneficiaires: BeneficiaireEffectif[] = [];

    for (const d of dirigeantsRaw) {
      if (d.type_dirigeant === 'personne physique') {
        // Personne physique trouvée -> bénéficiaire effectif
        beneficiaires.push({
          nom: d.nom || '',
          prenoms: d.prenoms || '',
          qualite: d.qualite || '',
          annee_naissance: d.annee_de_naissance?.toString() || undefined,
          chaine_controle: [...chaineActuelle],
        });
      } else if (d.type_dirigeant === 'personne morale' && d.siren) {
        // Personne morale -> résoudre récursivement si possible
        const sirenPM = d.siren;

        // Vérifier les limites
        if (profondeur >= MAX_DEPTH) {
          console.log(`Profondeur max atteinte pour SIREN ${sirenPM}`);
          continue;
        }

        if (sirensVisites.has(sirenPM)) {
          console.log(`Cycle détecté pour SIREN ${sirenPM}, ignoré`);
          continue;
        }

        // Marquer comme visité
        sirensVisites.add(sirenPM);

        // Récupérer les dirigeants de cette PM
        const dirigeantsPM = await this.fetchDirigeantsRaw(sirenPM);

        if (dirigeantsPM.length === 0) {
          // Pas de dirigeants trouvés, on ne peut pas remonter plus loin
          continue;
        }

        // Ajouter cette société à la chaîne de contrôle
        const nouvelleChaine = [
          ...chaineActuelle,
          {
            siren: sirenPM,
            denomination: d.denomination || '',
            qualite: d.qualite || '',
          },
        ];

        // Résoudre récursivement
        const beneficiairesPM = await this.resolveBeneficiairesEffectifs(
          dirigeantsPM,
          nouvelleChaine,
          sirensVisites,
          profondeur + 1
        );

        beneficiaires.push(...beneficiairesPM);
      }
    }

    return beneficiaires;
  }

  // Mappe la réponse API vers notre type (avec résolution des bénéficiaires effectifs)
  private async mapToEntrepriseEnrichie(data: any): Promise<EntrepriseEnrichie> {
    const siege = data.siege || {};
    const dirigeants = this.extractDirigeants(data);

    // Résoudre les bénéficiaires effectifs
    const dirigeantsRaw = data.dirigeants || [];
    const sirensVisites = new Set<string>();
    sirensVisites.add(data.siren); // Éviter de revisiter l'entreprise elle-même

    const beneficiaires_effectifs = await this.resolveBeneficiairesEffectifs(
      dirigeantsRaw,
      [], // Chaîne vide au départ
      sirensVisites,
      0
    );

    return {
      siren: data.siren || '',
      nom_complet: data.nom_complet || '',
      nom_raison_sociale: data.nom_raison_sociale || '',
      sigle: data.sigle || null,
      nature_juridique: data.nature_juridique || '',
      date_creation: data.date_creation || '',
      etat_administratif: data.etat_administratif || '',
      categorie_entreprise: data.categorie_entreprise || '',
      tranche_effectif: this.decodeTrancheEffectif(data.tranche_effectif_salarie),
      siege: this.mapSiege(siege),
      dirigeants,
      beneficiaires_effectifs,
      nombre_etablissements: data.nombre_etablissements_ouverts || 0,
    };
  }

  // Extrait les dirigeants depuis les données API
  private extractDirigeants(data: any): Dirigeant[] {
    const dirigeants: Dirigeant[] = [];

    // Dirigeants personnes physiques
    if (data.dirigeants) {
      for (const d of data.dirigeants) {
        if (d.type_dirigeant === 'personne physique') {
          dirigeants.push({
            nom: d.nom || '',
            prenoms: d.prenoms || '',
            qualite: d.qualite || '',
            type: 'personne_physique',
            annee_naissance: d.annee_de_naissance?.toString() || undefined,
          });
        } else if (d.type_dirigeant === 'personne morale') {
          dirigeants.push({
            nom: d.denomination || '',
            prenoms: '',
            qualite: d.qualite || '',
            type: 'personne_morale',
            siren: d.siren || undefined,
            denomination: d.denomination || undefined,
          });
        }
      }
    }

    return dirigeants;
  }

  // Mappe les données du siège
  private mapSiege(siege: any): SiegeEntreprise {
    const adresseParts = [
      siege.numero_voie,
      siege.type_voie,
      siege.libelle_voie,
    ].filter(Boolean);

    return {
      adresse: adresseParts.join(' ') || '',
      code_postal: siege.code_postal || '',
      commune: siege.libelle_commune || '',
      latitude: siege.latitude?.toString() || undefined,
      longitude: siege.longitude?.toString() || undefined,
    };
  }

  // Décode la tranche d'effectif
  private decodeTrancheEffectif(code: string): string {
    const tranches: Record<string, string> = {
      '00': '0 salarié',
      '01': '1 ou 2 salariés',
      '02': '3 à 5 salariés',
      '03': '6 à 9 salariés',
      '11': '10 à 19 salariés',
      '12': '20 à 49 salariés',
      '21': '50 à 99 salariés',
      '22': '100 à 199 salariés',
      '31': '200 à 249 salariés',
      '32': '250 à 499 salariés',
      '41': '500 à 999 salariés',
      '42': '1000 à 1999 salariés',
      '51': '2000 à 4999 salariés',
      '52': '5000 à 9999 salariés',
      '53': '10000 salariés et plus',
    };

    return tranches[code] || 'Non renseigné';
  }

  /**
   * Retourne les stats du cache (pour monitoring)
   */
  getCacheStats(): { size: number; fallbackMode: boolean; consecutive429s: number } {
    return {
      size: entreprisesCache.size,
      fallbackMode,
      consecutive429s,
    };
  }
}

// Instance singleton
export const entreprisesApi = new EntreprisesApiClient();

// Fonction utilitaire pour enrichir un SIREN
export async function enrichSiren(siren: string): Promise<EntrepriseEnrichie | null> {
  return entreprisesApi.searchBySiren(siren);
}

// Fonction utilitaire pour rechercher par nom
export async function searchEntreprises(denomination: string, limit?: number): Promise<EntrepriseEnrichie[]> {
  return entreprisesApi.searchByDenomination(denomination, limit);
}
