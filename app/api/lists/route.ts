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

    // Trois adaptations au schema reel, chacune correspondant a un echec constate :
    //  - le sous-select sur property_list_items : la table n'existe pas ;
    //  - ORDER BY pl.updated_at : la colonne n'existe pas non plus, donc meme la
    //    simple LECTURE des listes echouait ;
    //  - le compteur retombe a 0 plutot que de faire tomber la requete entiere.
    const colonnesListes = await getColonnes('property_lists');
    const aItems = await tableExiste('property_list_items');
    const colonneTri = colonnesListes.has('updated_at') ? 'pl.updated_at' : 'pl.created_at';

    const result = await query(
      `SELECT pl.*,
        ${aItems
          ? '(SELECT COUNT(*) FROM property_list_items WHERE list_id = pl.id)'
          : '0'} as item_count
       FROM property_lists pl
       WHERE pl.organization_id = $1
       ORDER BY ${colonneTri} DESC`,
      [auth.user.organization_id]
    );

    return NextResponse.json({ lists: result.rows });
  } catch (err: any) {
    return erreurServeur('lists', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'listes');
    if (refusPlan) return refusPlan;

    const { name, description, color } = await req.json();
    if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

    const colonnesPourInsert = await getColonnes('property_lists');
    const candidats: Array<[string, unknown]> = [
      ['organization_id', auth.user.organization_id],
      ['user_id', auth.user.id],
      ['name', name],
      ['description', description || null],
      ['color', color || '#3B82F6'],
    ];
    const retenus = candidats.filter(([c]) => c === 'name' || colonnesPourInsert.has(c));

    const result = await query(
      `INSERT INTO property_lists (${retenus.map(([c]) => c).join(', ')})
       VALUES (${retenus.map((_, i) => `$${i + 1}`).join(', ')})
       RETURNING *`,
      retenus.map(([, v]) => v)
    );

    return NextResponse.json({ list: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return erreurServeur('lists', err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'listes');
    if (refusPlan) return refusPlan;

    const { searchParams } = new URL(req.url);
    const listId = searchParams.get('id');
    if (!listId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    await query(
      'DELETE FROM property_lists WHERE id = $1 AND organization_id = $2',
      [listId, auth.user.organization_id]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return erreurServeur('lists', err);
  }
}
