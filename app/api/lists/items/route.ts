import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";
import { tableExiste, getColonnes } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { list_id, company_name, director_name, property_address, property_postal_code, property_city, siren, data, notes } = body;

    if (!list_id) return NextResponse.json({ error: 'list_id requis' }, { status: 400 });

    // Verify list belongs to org
    const listCheck = await query(
      'SELECT id FROM property_lists WHERE id = $1 AND organization_id = $2',
      [list_id, auth.user.organization_id]
    );
    if (listCheck.rows.length === 0) return NextResponse.json({ error: 'Liste non trouvée' }, { status: 404 });

    const result = await query(
      `INSERT INTO property_list_items (list_id, company_name, director_name, property_address, property_postal_code, property_city, siren, data, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [list_id, company_name || null, director_name || null, property_address || null, property_postal_code || null, property_city || null, siren || null, data ? JSON.stringify(data) : null, notes || null]
    );

    // Update list timestamp
    // property_lists n'a pas de colonne updated_at en production : la nommer en
    // dur faisait echouer l'ajout d'un item APRES son insertion reussie.
    if ((await getColonnes('property_lists')).has('updated_at')) {
      await query('UPDATE property_lists SET updated_at = now() WHERE id = $1', [list_id]);
    }

    return NextResponse.json({ item: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return erreurServeur('lists/items', err);
  }
}

export async function DELETE(req: NextRequest) {
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
    const itemId = searchParams.get('item_id');
    const listId = searchParams.get('list_id');

    if (!itemId || !listId) return NextResponse.json({ error: 'list_id et item_id requis' }, { status: 400 });

    // Verify list belongs to org
    const listCheck = await query(
      'SELECT id FROM property_lists WHERE id = $1 AND organization_id = $2',
      [listId, auth.user.organization_id]
    );
    if (listCheck.rows.length === 0) return NextResponse.json({ error: 'Liste non trouvée' }, { status: 404 });

    await query('DELETE FROM property_list_items WHERE id = $1 AND list_id = $2', [itemId, listId]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return erreurServeur('lists/items', err);
  }
}
