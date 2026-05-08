import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      `SELECT * FROM saved_searches 
       WHERE organization_id = $1 AND user_id = $2 
       ORDER BY created_at DESC`,
      [auth.user.organization_id, auth.user.id]
    );

    return NextResponse.json({ searches: result.rows });
  } catch (err: any) {
    logger.error('SAVED_SEARCH', 'GET error', { error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const body = await req.json();
    const { name, query_params, result_count } = body;

    if (!name || !query_params) {
      return NextResponse.json({ error: 'Nom et paramètres requis' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO saved_searches (organization_id, user_id, name, query_params, result_count, last_run_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [auth.user.organization_id, auth.user.id, name, JSON.stringify(query_params), result_count || 0]
    );

    logger.info('SAVED_SEARCH', 'Search saved', { searchId: result.rows[0].id });

    return NextResponse.json({ search: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    logger.error('SAVED_SEARCH', 'POST error', { error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    }

    await query(
      'DELETE FROM saved_searches WHERE id = $1 AND user_id = $2',
      [id, auth.user.id]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
