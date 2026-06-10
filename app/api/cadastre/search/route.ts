import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { logAudit, getIpFromRequest } from "@/lib/audit";

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
  // Construire l'IDU 14 chars : dept(2) + commune(3) + prefix(3) + section(2) + numero(4)
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

  const mappedProprietes = proprietes.map((prop: any) => {
    const addr = prop.adresse || prop;
    // Le backend retourne references_cadastrales (pluriel, tableau)
    const refs = prop.references_cadastrales || [];
    const firstRef = refs[0] || prop.reference_cadastrale || {};
    return {
      adresse: addr.adresse_complete || `${addr.numero || ''} ${addr.type_voie || ''} ${addr.nom_voie || ''}`.trim(),
      code_postal: addr.code_postal || '',
      ville: addr.commune || '',
      departement: addr.departement || firstRef.departement || '',
      section: firstRef.section || '',
      numero_parcelle: firstRef.numero_plan || '',
      reference_cadastrale: firstRef.reference_complete || '',
      code_commune: firstRef.code_commune || '',
      prefixe: firstRef.prefixe || '000',
      surface: prop.surface || 0,
      latitude: addr.latitude,
      longitude: addr.longitude,
    };
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
    const { auth, error, status, upgrade_required } = await authenticateRequest(req, { checkSearch: true });

    if (!auth) {
      return NextResponse.json({ error, upgrade_required }, { status: status || 401 });
    }

    // Audit de la recherche reussie (auth non-null ici)
    try {
      logAudit(auth, "search.address", "search", undefined, {}, getIpFromRequest(req));
    } catch {}

    const body = await req.json();
    const { adresse, adresses, code_postal, departement, denomination, siren, limit = 200,
            type_bien, surface_min, surface_max, prix_m2_min, prix_m2_max, copropriete } = body;

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
        `${CADASTRE_API_URL}/search/owner?denomination=${encodeURIComponent(denomination)}${departement ? `&departement=${departement}` : ''}&limit=${limit}`,
        { headers: { 'X-API-Key': CADASTRE_API_KEY } }
      );
      if (!backendResponse.ok) {
        throw new BackendError(backendErrorMessage(backendResponse.status), backendResponse.status);
      }
      const data = await backendResponse.json();
      if (data.success && data.resultats) allResults = data.resultats;
      searchType = 'owner';
    } else if (adresses && Array.isArray(adresses)) {
      for (const addr of adresses) {
        if (!addr.adresse || addr.adresse.length < 3) continue;
        try {
          const params = new URLSearchParams({ adresse: addr.adresse, limit: '10' });
          if (addr.departement) params.set('departement', addr.departement);
          const resp = await fetchBackend(`${CADASTRE_API_URL}/search/address?${params}`, {
            headers: { 'X-API-Key': CADASTRE_API_KEY },
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.success && data.resultats) allResults.push(...data.resultats);
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
      const params = new URLSearchParams({ adresse, limit: String(limit) });
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

    const enrichmentData = await fetchEnrichment(parcelles);

    for (const result of mappedResults) {
      const enrichments: any[] = [];
      for (const prop of result.proprietes || []) {
        const pid = buildParcelleId(prop);
        if (pid && enrichmentData[pid]) {
          enrichments.push(enrichmentData[pid]);
        }
      }
      if (enrichments.length > 0) {
        const e = enrichments[0];
        result.enrichissement = {
          type_bien: e.type_bien,
          surface_parcelle: e.surface_parcelle,
          surface_batie: e.surface_batie,
          prix_m2: e.prix_m2,
          date_derniere_transaction: e.date_derniere_transaction,
          nb_transactions: e.nb_transactions,
          est_copropriete: e.est_copropriete,
          nb_lots_total: e.nb_lots_total,
          nb_lots_habitation: e.nb_lots_habitation,
          nb_lots_tertiaire: e.nb_lots_tertiaire,
          nom_copropriete: e.nom_copropriete,
          annee_construction: e.annee_construction,
          nb_niveaux: e.nb_niveaux,
          nb_logements: e.nb_logements,
          surface_lots_carrez: e.surface_lots_carrez,
          type_transaction: e.type_transaction,
        };
        result.enriched = true;
      }
    }

    // === FILTRAGE par critères d'enrichissement ===
    const hasFilters = type_bien?.length > 0 || surface_min || surface_max || prix_m2_min || prix_m2_max || (copropriete && copropriete !== 'tous');
    let filteredResults = mappedResults;
    if (hasFilters) {
      filteredResults = mappedResults.filter((r: any) => {
        const e = r.enrichissement;
        if (!e) return false; // Pas d'enrichissement = pas de données pour filtrer

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

    // Log search
    query(
      `INSERT INTO search_history (user_id, organization_id, search_type, query_data, results_count)
       VALUES ($1, $2, $3, $4, $5)`,
      [auth.user.id, auth.user.organization_id, searchType,
       JSON.stringify({ adresse, denomination, siren, departement }), mappedResults.length]
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      resultats: filteredResults,
      total_proprietaires: filteredResults.length,
      total_lots: filteredResults.reduce((sum: number, r: any) => sum + (r.nombre_lots || 0), 0),
      searches_remaining: auth.searchCheck?.remaining,
      upsell_message: auth.searchCheck?.message,
    });

  } catch (error: any) {
    console.error('[SEARCH] Error:', error);
    if (error instanceof BackendError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Délai dépassé côté serveur cadastre' }, { status: 504 });
    }
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 });
  }
}
