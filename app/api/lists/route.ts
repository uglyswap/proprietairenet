import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      `SELECT pl.*, 
        (SELECT COUNT(*) FROM property_list_items WHERE list_id = pl.id) as item_count
       FROM property_lists pl
       WHERE pl.organization_id = $1
       ORDER BY pl.updated_at DESC`,
      [auth.user.organization_id]
    );

    return NextResponse.json({ lists: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { name, description, color } = await req.json();
    if (!name) return NextResponse.json({ error: 'Nom requis' }, { status: 400 });

    const result = await query(
      `INSERT INTO property_lists (organization_id, user_id, name, description, color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [auth.user.organization_id, auth.user.id, name, description || null, color || '#3B82F6']
    );

    return NextResponse.json({ list: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { searchParams } = new URL(req.url);
    const listId = searchParams.get('id');
    if (!listId) return NextResponse.json({ error: 'id requis' }, { status: 400 });

    await query(
      'DELETE FROM property_lists WHERE id = $1 AND organization_id = $2',
      [listId, auth.user.organization_id]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
