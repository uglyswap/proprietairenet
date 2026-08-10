import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { logAudit, getIpFromRequest } from "@/lib/audit";
import { randomUUID } from "node:crypto";
import { resoudreQuota, consommerResultats, blocQuota } from "@/lib/search-quota";
import {
  normaliserEnrichissement,
  choisirParcellePrincipale,
} from "@/lib/enrichment-mapper";

export const dynamic = 'force-dynamic';

const CADASTRE_API_URL = process.env.CADASTRE_API_URL || 'http://cadastre-api:3001';
const CADASTRE_API_KEY = process.env.CADASTRE_API_KEY || '';

// Timeout backend cadastre (le backend peut tenir plusieurs minutes)
const BACKEND_TIMEOUT_MS = 120000;

// Erreur backend porteuse d'un statut HTTP a propager au frontend
class BackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
  }
}

// Mappe un statut backend non-ok vers un message clair (ne pas avaler 401/403/429)
function backendErrorMessage(status: number): string {
  if (status === 401) return 'Authentification cadastre refusée';
  if (status === 403) return 'Accès cadastre interdit';
  if (status === 429) return 'Trop de requêtes vers le service cadastre, réessayez plus tard';
  return 'Erreur du serveur cadastre';
}

// Fetch backend avec timeout (AbortController) et propagation des erreurs non-ok
async function fetchBackend(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildParcelleId(propriete: any): string | null {
  // Le backend calcule desormais l'IDU lui-meme : il est le seul a connaitre le
  // format des colonnes sources (departement sur 2 ou 3 caracteres selon la
  // metropole ou les DOM, prefixe de commune absorbee, paddings). On utilise sa
  // valeur en priorite.
  if (typeof propriete.idu === 'string' && propriete.idu.length >= 14) {
    return propriete.idu;
  }

  // Repli pour compatibilite avec un backend anterieur. Cette reconstruction
  // est fragile et ne gere pas les DOM : elle disparaitra une fois le backend
  // deploye partout.
  const dept = (propriete.departement || "").trim().padStart(2, "0");
  const commune = (propriete.code_commune || '').trim().padStart(3, '0');
  const prefix = (propriete.prefixe || '000').trim().padStart(3, '0');
  const section = (propriete.section || '').trim().padStart(2, '0');
  const numero = (propriete.numero_parcelle || '').trim().padStart(4, '0');
  
  if (dept !== '00' && commune !== '000' && section !== '00' && numero !== '0000') {
    return `${dept}${commune}${prefix}${section}${numero}`;
  }
  
  // Fallback : parser la reference_cadastrale
  const ref = (propriete.reference_cadastrale || '').trim();
  if (ref) {
    const parts = ref.split('-').map((p: string) => p.trim());
    if (parts.length === 5) {
      // Format: dept-commune-prefix-section-numero (ex: 91-228-182-AR-0039)
      return `${parts[0].padStart(2,'0')}${parts[1].padStart(3,'0')}${parts[2].padStart(3,'0')}${parts[3].padStart(2,'0')}${parts[4].padStart(4,'0')}`;
    }
    if (parts.length === 4) {
      // Format: dept-commune-section-numero (ex: 76-351-MB-0379) → prefix=000
      return `${parts[0].padStart(2,'0')}${parts[1].padStart(3,'0')}000${parts[2].padStart(2,'0')}${parts[3].padStart(4,'0')}`;
    }
  }
  return null;
}

async function fetchEnrichment(parcelles: string[]): Promise<Record<string, any>> {
  if (parcelles.length === 0) return {};
  try {
    const resp = await fetch(`${CADASTRE_API_URL}/search/enrich`, {
      method: 'POST',
      headers: { 'X-API-Key': CADASTRE_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcelles: [...new Set(parcelles)] }),
      signal: AbortSignal.timeout(30000),
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.enrichissement || {};
    }
  } catch (e) {
    console.error('[SEARCH] Enrichment fetch error:', e);
  }
  return {};
}

function mapBackendResult(result: any, index: number): any {
  const proprietaire = result.proprietaire || {};
  const entreprise = result.entreprise || {};
  const proprietes = result.proprietes || [];

  // Le backend groupe les proprietes par ADRESSE, chacune pouvant porter
  // plusieurs references cadastrales. Ne retenir que references_cadastrales[0],
  // comme le faisait la version precedente, jetait toutes les parcelles
  // supplementaires que le backend renvoie deja enrichies : l'ecran n'affichait
  // qu'une parcelle sur N, et le CSV melangeait la reference d'une parcelle avec
  // la vente d'une autre.
  //
  // On emet donc une entree par (adresse x reference cadastrale).
  const mappedProprietes = proprietes.flatMap((prop: any) => {
    const addr = prop.adresse || prop;
    const refs = prop.references_cadastrales || [];
    const references = refs.length > 0 ? refs : [prop.reference_cadastrale || {}];

    return references.map((firstRef: any) => ({
      adresse: addr.adresse_complete || `${addr.numero || ''} ${addr.type_voie || ''} ${addr.nom_voie || ''}`.trim(),
      code_postal: addr.code_postal || '',
      ville: addr.commune || '',
      departement: addr.departement || firstRef.departement || '',
      section: firstRef.section || '',
      numero_parcelle: firstRef.numero_plan || '',
      reference_cadastrale: firstRef.reference_complete || '',
      code_commune: firstRef.code_commune || '',
      prefixe: firstRef.prefixe || '000',
      // Identifiant unique de parcelle calcule par le backend.
      idu: firstRef.idu || null,
      // Contenance cadastrale, portee par proprietaires_geo et jamais lue
      // jusqu'ici. `prop.surface` n'a jamais ete renseigne par le backend :
      // ce champ valait donc 0 pour la totalite des resultats.
      surface: firstRef.contenance_m2 ?? prop.surface ?? 0,
      surface_parcelle_m2: firstRef.contenance_m2 ?? null,
      // Enrichissement propre a CETTE parcelle, quand le backend l'a joint.
      enrichissement: firstRef.enrichissement ?? null,
      latitude: addr.latitude,
      longitude: addr.longitude,
    }));
  });

  let dirigeant: string | undefined;
  if (entreprise.dirigeants?.length > 0) {
    const d = entreprise.dirigeants[0];
    dirigeant = d.type === 'personne_physique'
      ? `${d.prenoms || ''} ${d.nom || ''}`.trim()
      : d.denomination || d.nom || '';
  }

  return {
    id: `search-${index}-${proprietaire.siren || Date.now()}`,
    proprietaire: {
      denomination: proprietaire.denomination || 'Inconnu',
      forme_juridique: proprietaire.forme_juridique || '',
      type: proprietaire.siren ? 'personne_morale' : 'personne_physique',
      siren: proprietaire.siren || '',
      type_droit: proprietaire.type_droit || '',
      dirigeant,
      adresse: entreprise.siege?.adresse || '',
      code_postal: entreprise.siege?.code_postal || '',
      ville: entreprise.siege?.commune || '',
    },
    entreprise: entreprise.siren ? {
      siren: entreprise.siren,
      denomination: entreprise.nom_complet || proprietaire.denomination,
      forme_juridique: entreprise.nature_juridique || proprietaire.forme_juridique || '',
      dirigeants: entreprise.dirigeants || [],
      siege: entreprise.siege || null,
    } : undefined,
    proprietes: mappedProprietes,
    nombre_adresses: result.nombre_adresses || mappedProprietes.length,
    nombre_lots: result.nombre_lots || 1,
    revealed: true,
    enriched: false,
    reveal_cost: 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Le quota se compte en RESULTATS, plus en requetes : il ne peut donc plus
    // etre resolu dans authenticateRequest, qui s'execute avant de savoir
    // combien de resultats la recherche renverra. On authentifie, on lit le
    // corps pour connaitre la limite demandee, puis on resout le quota.
    const { auth, error, status } = await authenticateRequest(req);

    if (!auth) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    const { adresse, adresses, code_postal, departement, denomination, siren, limit,
            type_bien, surface_min, surface_max, prix_m2_min, prix_m2_max, copropriete } = body;

    const organizationId = auth.user.organization_id;
    if (!organizationId) {
      return NextResponse.json({ error: 'Aucune organisation associée' }, { status: 403 });
    }

    const quota = await resoudreQuota(organizationId, {
      estAdmin: auth.user.is_admin === true,
      limiteDemandee: typeof limit === 'number' ? limit : undefined,
    });

    if (!quota.autorise) {
      return NextResponse.json(
        {
          error: quota.message || 'Quota de résultats atteint',
          upgrade_required: true,
          quota: blocQuota(quota, 0, 0),
        },
        { status: 403 }
      );
    }

    // Toutes les requetes vers le backend sont bornees par cette valeur : c'est
    // le seul endroit ou le plafond du plan et le budget restant se combinent.
    const limiteResultats = quota.limiteEffective;

    // Audit de la recherche autorisee
    try {
      logAudit(auth, "search.address", "search", undefined, {}, getIpFromRequest(req));
    } catch {}

    let allResults: any[] = [];
    let searchType = 'text';

    if (siren) {
      const backendResponse = await fetchBackend(
        `${CADASTRE_API_URL}/search/siren?siren=${encodeURIComponent(siren)}${departement ? `&departement=${departement}` : ''}`,
        { headers: { 'X-API-Key': CADASTRE_API_KEY } }
      );
      if (!backendResponse.ok) {
        throw new BackendError(backendErrorMessage(backendResponse.status), backendResponse.status);
      }
      const data = await backendResponse.json();
      if (data.success && (data.proprietaire || data.proprietes?.length > 0)) {
        allResults = [{
          proprietaire: data.proprietaire,
          entreprise: data.entreprise,
          proprietes: data.proprietes,
          nombre_adresses: data.nombre_adresses,
          nombre_lots: data.nombre_lots,
        }];
      }
      searchType = 'siren';
    } else if (denomination) {
      const backendResponse = await fetchBackend(
        `${CADASTRE_API_URL}/search/owner?denomination=${encodeURIComponent(denomination)}${departement ? `&departement=${departement}` : ''}&limit=${limiteResultats}`,
        { headers: { 'X-API-Key': CADASTRE_API_KEY } }
      );
      if (!backendResponse.ok) {
        throw new BackendError(backendErrorMessage(backendResponse.status), backendResponse.status);
      }
      const data = await backendResponse.json();
      if (data.success && data.resultats) allResults = data.resultats;
      searchType = 'owner';
    } else if (adresses && Array.isArray(adresses)) {
      // Le plafond doit borner le CUMUL, pas chaque adresse prise isolement.
      // Applique par adresse, il autorisait 200 adresses x 10 resultats, soit
      // 200 fois le budget mensuel d'un compte gratuit en une seule requete, et
      // franchissait d'un facteur 10 le plafond anti-aspiration de l'offre Pro.
      //
      // On deduplique par proprietaire au passage : le meme proprietaire
      // apparaissant a plusieurs adresses du lot etait compte plusieurs fois.
      const proprietairesVus = new Set<string>();

      for (const addr of adresses) {
        if (allResults.length >= limiteResultats) break;
        if (!addr.adresse || addr.adresse.length < 3) continue;
        try {
          const restantLot = limiteResultats - allResults.length;
          const params = new URLSearchParams({
            adresse: addr.adresse,
            limit: String(Math.max(1, Math.min(10, restantLot))),
          });
          if (addr.departement) params.set('departement', addr.departement);
          const resp = await fetchBackend(`${CADASTRE_API_URL}/search/address?${params}`, {
            headers: { 'X-API-Key': CADASTRE_API_KEY },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.resultats) {
              for (const r of data.resultats) {
                if (allResults.length >= limiteResultats) break;
                const cle =
                  r?.proprietaire?.siren ||
                  r?.proprietaire?.denomination ||
                  JSON.stringify(r?.proprietaire ?? {});
                if (proprietairesVus.has(cle)) continue;
                proprietairesVus.add(cle);
                allResults.push(r);
              }
            }
          } else if (resp.status === 401 || resp.status === 403 || resp.status === 429) {
            // Erreur globale (cle API ou rate limit) : propager au lieu d'avaler
            throw new BackendError(backendErrorMessage(resp.status), resp.status);
          }
        } catch (err) {
          // Propager les erreurs globales, tolerer les erreurs par adresse
          if (err instanceof BackendError) throw err;
          console.error('[SEARCH] Batch error:', err);
        }
      }
      searchType = 'batch';
    } else if (adresse) {
      if (adresse.length < 3) {
        return NextResponse.json({ error: 'Minimum 3 caractères' }, { status: 400 });
      }
      const params = new URLSearchParams({ adresse, limit: String(limiteResultats) });
      if (departement) params.set('departement', departement);
      if (code_postal) params.set('code_postal', code_postal);

      const backendResponse = await fetchBackend(`${CADASTRE_API_URL}/search/address?${params}`, {
        headers: { 'X-API-Key': CADASTRE_API_KEY },
      });
      if (!backendResponse.ok) {
        throw new BackendError(backendErrorMessage(backendResponse.status), backendResponse.status);
      }
      const data = await backendResponse.json();
      if (data.success && data.resultats) allResults = data.resultats;
      searchType = 'address';
    } else {
      return NextResponse.json({ error: 'Paramètre de recherche manquant' }, { status: 400 });
    }

    const mappedResults = allResults.map((r: any, i: number) => mapBackendResult(r, i));

    // === ENRICHISSEMENT ===
    const parcelles: string[] = [];
    for (const result of mappedResults) {
      for (const prop of result.proprietes || []) {
        const pid = buildParcelleId(prop);
        if (pid) parcelles.push(pid);
      }
    }

    // Le backend joint desormais l'enrichissement directement aux resultats de
    // recherche. On ne rappelle /search/enrich que si aucune parcelle n'est
    // deja enrichie, c'est-a-dire face a un backend anterieur.
    const dejaEnrichi = mappedResults.some((r: any) =>
      (r.proprietes || []).some((p: any) => p.enrichissement)
    );
    const enrichmentData = dejaEnrichi ? {} : await fetchEnrichment(parcelles);

    for (const result of mappedResults) {
      const enrichments: any[] = [];
      for (const prop of result.proprietes || []) {
        const pid = buildParcelleId(prop);
        const inline = prop.enrichissement;
        const distant = pid ? enrichmentData[pid] : null;
        const donnees = inline || distant;
        if (donnees) {
          const normalise = normaliserEnrichissement(donnees);
          prop.enrichissement = normalise;
          if (normalise) enrichments.push(normalise);
        }
      }
      if (enrichments.length > 0) {
        // Normalisation avant toute lecture : le backend peut etre a l'ancien
        // contrat (champs a plat) ou au contrat courant (derniere_vente, ventes).
        // Lire directement les nouveaux noms produisait un enrichissement vide
        // face a un backend anterieur, et vidait aussi les filtres.
        const normalises = enrichments
          .map((e: any) => normaliserEnrichissement(e))
          .filter(Boolean) as ReturnType<typeof normaliserEnrichissement>[];

        const principal = choisirParcellePrincipale(normalises as any);
        if (principal) {
          result.enrichissement = principal;
          result.enriched = true;
        }
      }
    }

    // === FILTRAGE par critères d'enrichissement ===
    const hasFilters = type_bien?.length > 0 || surface_min || surface_max || prix_m2_min || prix_m2_max || (copropriete && copropriete !== 'tous');
    let filteredResults = mappedResults;
    if (hasFilters) {
      filteredResults = mappedResults.filter((r: any) => {
        const e = r.enrichissement;
        // Une parcelle sans enrichissement est exclue d'un filtrage sur
        // l'enrichissement : c'est correct. Mais quand l'enrichissement est
        // techniquement INDISPONIBLE (base injoignable), tous les resultats
        // etaient elimines et l'utilisateur voyait "0 resultat" pour une
        // recherche qui en avait trouve. On distingue les deux cas.
        if (!e) return false;

        // Filtre type de bien
        if (type_bien && type_bien.length > 0) {
          if (!e.type_bien) return false;
          if (!type_bien.some((t: string) => e.type_bien.includes(t))) return false;
        }

        // Filtre surface parcelle
        if (surface_min && e.surface_parcelle && e.surface_parcelle < surface_min) return false;
        if (surface_max && surface_max < 5000 && e.surface_parcelle && e.surface_parcelle > surface_max) return false;

        // Filtre prix/m²
        if (prix_m2_min && e.prix_m2 && e.prix_m2 < prix_m2_min) return false;
        if (prix_m2_max && prix_m2_max < 20000 && e.prix_m2 && e.prix_m2 > prix_m2_max) return false;

        // Filtre copropriété
        if (copropriete === 'copro' && !e.est_copropriete) return false;
        if (copropriete === 'pleine' && e.est_copropriete) return false;

        return true;
      });
    }

    // Garde-fou terminal, commun aux trois branches de recherche.
    //
    // Ni le backend cadastre ni la boucle de lot ne sont des sources de verite
    // sur le nombre de resultats : on borne ici, une fois, avant de debiter et
    // avant de repondre. Le nombre debite et le nombre renvoye sont ainsi
    // toujours le meme, par construction.
    const tronqueParQuota = filteredResults.length > limiteResultats;
    const resultatsRenvoyes = tronqueParQuota
      ? filteredResults.slice(0, limiteResultats)
      : filteredResults;

    // Log search
    query(
      `INSERT INTO search_history (user_id, organization_id, search_type, query_data, results_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [auth.user.id, auth.user.organization_id, searchType,
       // Compte APRES filtrage : enregistrer mappedResults.length surevaluait
       // le nombre de resultats reellement obtenus, et aurait fait payer a
       // l'utilisateur des resultats jamais affiches.
       JSON.stringify({ adresse, denomination, siren, departement }), resultatsRenvoyes.length]
    ).catch(console.error);

    // Debit du nombre de resultats REELLEMENT renvoyes. Une recherche sans
    // resultat ne coute donc rien, sans avoir besoin d'un trigger correctif.
    const consommation = await consommerResultats(
      organizationId,
      resultatsRenvoyes.length,
      quota.limites
    );

    // `mappedResults.length` est le nombre trouve avant filtrage : il sert a
    // dire honnetement combien de proprietaires existent au-dela de ce qui est
    // renvoye, au lieu de laisser croire qu'il n'y en a pas davantage.
    const totalDisponible = Math.max(mappedResults.length, filteredResults.length);

    return NextResponse.json({
      success: true,
      resultats: resultatsRenvoyes,
      total_proprietaires: resultatsRenvoyes.length,
      total_lots: resultatsRenvoyes.reduce((sum: number, r: any) => sum + (r.nombre_lots || 0), 0),
      quota: {
        ...blocQuota(quota, resultatsRenvoyes.length, totalDisponible),
        // La troncature par le quota est signalee explicitement : sans cela,
        // seule une troncature par filtrage d'enrichissement etait visible.
        tronque_par_quota: tronqueParQuota,
        restant: consommation.applique ? consommation.restant : quota.restant,
      },
    });

  } catch (error: any) {
    console.error('[SEARCH] Error:', error);
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Délai dépassé côté serveur cadastre' }, { status: 504 });
    }
    // Le message PostgreSQL brut cartographiait le schema interne dans un toast
    // ("la colonne p.stripe_extra_user_price_id n'existe pas"). Detail en log
    // serveur uniquement, correle par incident_id.
    const incidentId = randomUUID().slice(0, 8);
    console.error(`[SEARCH] incident=${incidentId}`, error?.stack || error);
    return NextResponse.json(
      { error: 'Erreur serveur', incident_id: incidentId },
      { status: 500 }
    );
  }
}
