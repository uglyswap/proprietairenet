import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";
import { getColonnes } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'listes');
    if (refusPlan) return refusPlan;

    const searchResult = await query(
      'SELECT * FROM saved_searches WHERE id = $1 AND user_id = $2',
      [params.id, auth.user.id]
    );

    if (searchResult.rows.length === 0) {
      return NextResponse.json({ error: 'Recherche non trouvée' }, { status: 404 });
    }

    const savedSearch = searchResult.rows[0];

    // Update last_run_at
    await query(
      // last_run_at est absente de la production : sans garde, l'execution d'une
      // recherche sauvegardee echouait APRES avoir renvoye ses resultats.
      (await getColonnes('saved_searches')).has('last_run_at')
        ? 'UPDATE saved_searches SET last_run_at = NOW() WHERE id = $1'
        : 'SELECT $1::uuid',
      [params.id]
    );

    return NextResponse.json({
      search: savedSearch,
      query_params: savedSearch.query_params,
    });
  } catch (err: any) {
    return erreurServeur('saved-searches/[id]/run', err);
  }
}
