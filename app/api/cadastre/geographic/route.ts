import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { logAudit, getIpFromRequest } from "@/lib/audit";
import { erreurServeur } from '@/lib/api-error';
import { normaliserEnrichissement, choisirParcellePrincipale } from "@/lib/enrichment-mapper";

export const dynamic = 'force-dynamic';

const CADASTRE_API_URL = process.env.CADASTRE_API_URL || 'http://84.247.175.132:8765';
const CADASTRE_API_KEY = process.env.CADASTRE_API_KEY || '';

// Timeout backend cadastre (le backend peut tenir plusieurs minutes)
const BACKEND_TIMEOUT_MS = 120000;

// Mappe un statut backend non-ok vers un message clair (ne pas avaler 401/403/429)
function backendErrorMessage(status: number): string {
  if (status === 401) return 'Authentification cadastre refusée';
  if (status === 403) return 'Accès cadastre interdit';
  if (status === 429) return 'Trop de requêtes vers le service cadastre, réessayez plus tard';
  return 'Erreur du serveur cadastre';
}

// Fetch backend avec timeout (AbortController)
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
  const dept = (propriete.departement || '').trim().padStart(2, '0');
  const commune = (propriete.code_commune || '').trim().padStart(3, '0');
  const prefix = (propriete.prefixe || '000').trim().padStart(3, '0');
  const section = (propriete.section || '').trim().padStart(2, '0');
  const numero = (propriete.numero_parcelle || '').trim().padStart(4, '0');
  
  if (dept !== '00' && commune !== '000' && section !== '00' && numero !== '0000') {
    return `${dept}${commune}${prefix}${section}${numero}`;
  }
  
  const ref = (propriete.reference_cadastrale || '').trim();
  if (ref) {
    const parts = ref.split('-').map((p: string) => p.trim());
    if (parts.length === 5) {
      return `${parts[0].padStart(2,'0')}${parts[1].padStart(3,'0')}${parts[2].padStart(3,'0')}${parts[3].padStart(2,'0')}${parts[4].padStart(4,'0')}`;
    }
    if (parts.length === 4) {
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
    console.error('[GEO] Enrichment fetch error:', e);
  }
  return {};
}

function mapBackendResult(result: any, index: number): any {
  const proprietaire = result.proprietaire || {};
  const entreprise = result.entreprise || {};
  const proprietes = result.proprietes || [];
  const coordonnees = result.coordonnees || [];

  let mainLat: number | undefined;
  let mainLon: number | undefined;
  if (coordonnees.length > 0) {
    mainLat = coordonnees[0].latitude;
    mainLon = coordonnees[0].longitude;
  }

  const mappedProprietes = proprietes.map((prop: any) => {
    const addr = prop.adresse || {};
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
      latitude: addr.latitude || mainLat,
      longitude: addr.longitude || mainLon,
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
    id: `geo-${index}-${proprietaire.siren || Date.now()}`,
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

    // Audit de la recherche par zone reussie (auth non-null ici)
    try {
      logAudit(auth, "search.zone", "search", undefined, {}, getIpFromRequest(req));
    } catch {}

    const body = await req.json();
    const { coordinates, limit = 200 } = body;

    if (!coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      return NextResponse.json({ error: 'Minimum 3 points requis' }, { status: 400 });
    }

    const polygon = coordinates.map((coord: number[]) => [coord[0], coord[1]]);

    const backendResponse = await fetchBackend(`${CADASTRE_API_URL}/search/geo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CADASTRE_API_KEY,
      },
      body: JSON.stringify({ polygon, limit, stream: false }),
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || backendErrorMessage(backendResponse.status) },
        { status: backendResponse.status }
      );
    }

    const backendData = await backendResponse.json();
    if (!backendData.success) {
      return NextResponse.json({ error: 'Recherche échouée' }, { status: 500 });
    }

    const rawResults = backendData.proprietaires || backendData.resultats || [];
    const mappedResults = rawResults.map((r: any, i: number) => mapBackendResult(r, i));

    // === ENRICHISSEMENT ===
    const parcelles: string[] = [];
    for (const result of mappedResults) {
      for (const prop of result.proprietes || []) {
        const pid = buildParcelleId(prop);
        if (pid) parcelles.push(pid);
      }
    }

    // Le backend joint desormais l'enrichissement aux resultats : on ne rappelle
    // /search/enrich que si aucune parcelle n'en porte deja.
    const dejaEnrichi = mappedResults.some((r: any) =>
      (r.proprietes || []).some((p: any) => p.enrichissement)
    );
    const enrichmentData = dejaEnrichi ? {} : await fetchEnrichment(parcelles);

    for (const result of mappedResults) {
      const enrichments: any[] = [];
      for (const prop of result.proprietes || []) {
        const pid = buildParcelleId(prop);
        const donnees = prop.enrichissement || (pid ? enrichmentData[pid] : null);
        if (donnees) {
          const normalise = normaliserEnrichissement(donnees);
          prop.enrichissement = normalise;
          if (normalise) enrichments.push(normalise);
        }
      }
      if (enrichments.length > 0) {
        // Meme normalisation que /api/cadastre/search : cette route lisait les
        // anciens noms de champs et ressortait un enrichissement entierement
        // vide face au contrat courant du backend.
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

    // Log search (non-blocking)
    query(
      `INSERT INTO search_history (user_id, organization_id, search_type, query_data, results_count)
       VALUES ($1, $2, 'map', $3, $4)`,
      [auth.user.id, auth.user.organization_id, JSON.stringify({ coordinates, limit }), mappedResults.length]
    ).catch(console.error);

    return NextResponse.json({
      success: true,
      resultats: mappedResults,
      total_proprietaires: backendData.total_proprietaires || mappedResults.length,
      total_lots: backendData.total_lots || 0,
      stats: backendData.stats || {},
      searches_remaining: auth.searchCheck?.remaining,
      upsell_message: auth.searchCheck?.message,
    });

  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Délai dépassé côté serveur cadastre' }, { status: 504 });
    }
    return erreurServeur('cadastre/geographic', error);
  }
}
