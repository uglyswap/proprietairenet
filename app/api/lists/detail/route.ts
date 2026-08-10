import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";
import { tableExiste, getColonnes } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'listes');
    if (refusPlan) return refusPlan;
    // La table property_list_items n'existe pas encore en production : les
    // requetes levaient un 42P01 remonte en HTTP 500 opaque, et l'utilisateur
    // croyait a une panne alors que la fonctionnalite n'est pas deployee.
    if (!(await tableExiste('property_list_items'))) {
      return NextResponse.json(
        {
          error:
            "La fonctionnalité listes n'est pas encore disponible sur cette " +
            "installation. Appliquer migrations/008_listes_et_recherches_sauvegardees.sql.",
          code: 'FONCTIONNALITE_NON_DEPLOYEE',
        },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(req.url);
    const listId = searchParams.get('id');
    if (!listId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    const listResult = await query(
      'SELECT * FROM property_lists WHERE id = $1 AND organization_id = $2',
      [listId, auth.user.organization_id]
    );
    if (listResult.rows.length === 0) return NextResponse.json({ error: 'Liste non trouvée' }, { status: 404 });

    const items = await query(
      'SELECT * FROM property_list_items WHERE list_id = $1 ORDER BY created_at DESC',
      [listId]
    );

    return NextResponse.json({
      list: listResult.rows[0],
      items: items.rows,
    });
  } catch (err: any) {
    return erreurServeur('lists/detail', err);
  }
}
