import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import logger from '@/lib/logger';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    // Only owner and admin can view audit log
    const denied = await checkPermission(auth, 'team.manage');
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '30'), 1), 200);
    const offset = (page - 1) * limit;
    const actionFilter = searchParams.get('action');
    const userFilter = searchParams.get('user_id');
    const dateFrom = searchParams.get('from');
    const dateTo = searchParams.get('to');

    let sql = 'SELECT * FROM audit_log WHERE organization_id = $1';
    const params: any[] = [auth.user.organization_id];

    if (actionFilter && actionFilter !== 'all') {
      params.push(actionFilter);
      sql += ` AND action = $${params.length}`;
    }
    if (userFilter) {
      params.push(userFilter);
      sql += ` AND user_id = $${params.length}`;
    }
    if (dateFrom) {
      params.push(dateFrom);
      sql += ` AND created_at >= $${params.length}`;
    }
    if (dateTo) {
      params.push(dateTo);
      sql += ` AND created_at <= $${params.length}`;
    }

    const countResult = await query(
      sql.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return NextResponse.json({
      events: result.rows,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err: any) {
    logger.error('AUDIT', 'GET audit log error', { error: err.message });
    return erreurServeur('audit', err);
  }
}
