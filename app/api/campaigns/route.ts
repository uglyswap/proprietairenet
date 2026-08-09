import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import { logAudit, getIpFromRequest } from '@/lib/audit';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const denied = await checkPermission(auth, 'courrier.bulk');
    if (denied) return denied;

    const result = await query(
      'SELECT * FROM campaigns WHERE organization_id = $1 ORDER BY created_at DESC',
      [auth.user.organization_id]
    );

    return NextResponse.json({ campaigns: result.rows });
  } catch (err: any) {
    return erreurServeur('campaigns', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const denied = await checkPermission(auth, 'courrier.bulk');
    if (denied) return denied;

    const body = await req.json();
    const {
      name, template_a_name, template_a_content,
      template_b_name, template_b_content, split_ratio = 50, notes,
    } = body;

    if (!name) return NextResponse.json({ error: 'Nom de campagne requis' }, { status: 400 });
    if (!template_a_content) return NextResponse.json({ error: 'Template A requis' }, { status: 400 });

    const result = await query(
      `INSERT INTO campaigns (organization_id, user_id, name, template_a_name, template_a_content,
        template_b_name, template_b_content, split_ratio, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        auth.user.organization_id, auth.user.id, name,
        template_a_name || 'Template A', template_a_content,
        template_b_name || null, template_b_content || null,
        split_ratio, notes || null,
      ]
    );

    logAudit(auth, 'campaign.create', 'campaign', result.rows[0].id, { name }, getIpFromRequest(req));

    return NextResponse.json({ campaign: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return erreurServeur('campaigns', err);
  }
}
