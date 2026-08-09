import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const body = await req.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids requis' }, { status: 400 });
    }

    // Mark notifications as read (only if they belong to this user)
    const placeholders = ids.map((_: string, i: number) => `$${i + 2}`).join(',');
    await query(
      `UPDATE notifications SET read = true WHERE user_id = $1 AND id IN (${placeholders})`,
      [auth.user.id, ...ids]
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return erreurServeur('notifications/read', err);
  }
}
