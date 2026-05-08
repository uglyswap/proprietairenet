import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
