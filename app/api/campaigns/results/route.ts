import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const denied = await checkPermission(auth, 'courrier.bulk');
    if (denied) return denied;

    const body = await req.json();
    const { campaign_id, responses_a, responses_b, notes, mark_completed } = body;

    if (!campaign_id) return NextResponse.json({ error: 'campaign_id requis' }, { status: 400 });

    const existing = await query(
      'SELECT id FROM campaigns WHERE id = $1 AND organization_id = $2',
      [campaign_id, auth.user.organization_id]
    );
    if (existing.rows.length === 0) return NextResponse.json({ error: 'Campagne non trouvée' }, { status: 404 });

    const updates: string[] = ['updated_at = now()'];
    const params: any[] = [];

    if (responses_a !== undefined) {
      params.push(responses_a);
      updates.push(`responses_a = $${params.length}`);
    }
    if (responses_b !== undefined) {
      params.push(responses_b);
      updates.push(`responses_b = $${params.length}`);
    }
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    if (mark_completed) {
      updates.push(`status = 'completed'`);
    }

    params.push(campaign_id);
    await query(
      `UPDATE campaigns SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );

    const result = await query('SELECT * FROM campaigns WHERE id = $1', [campaign_id]);

    return NextResponse.json({ campaign: result.rows[0] });
  } catch (err: any) {
    return erreurServeur('campaigns/results', err);
  }
}
