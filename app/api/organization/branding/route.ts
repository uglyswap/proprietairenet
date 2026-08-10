import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { checkPermission } from '@/lib/permissions';
import { logAudit, getIpFromRequest } from '@/lib/audit';
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'personnalisation');
    if (refusPlan) return refusPlan;

    const result = await query(
      'SELECT logo_courrier_url, courrier_header, courrier_footer FROM organizations WHERE id = $1',
      [auth.user.organization_id]
    );

    return NextResponse.json({ branding: result.rows[0] || {} });
  } catch (err: any) {
    return erreurServeur('organization/branding', err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'personnalisation');
    if (refusPlan) return refusPlan;

    const denied = await checkPermission(auth, 'settings.edit');
    if (denied) return denied;

    const { logo_courrier_url, courrier_header, courrier_footer } = await req.json();

    // Validate logo size if base64 (max ~500KB)
    if (logo_courrier_url && logo_courrier_url.startsWith('data:') && logo_courrier_url.length > 700000) {
      return NextResponse.json({ error: 'Logo trop volumineux (max 500KB)' }, { status: 400 });
    }

    await query(
      `UPDATE organizations SET logo_courrier_url = $1, courrier_header = $2, courrier_footer = $3, updated_at = now() WHERE id = $4`,
      [logo_courrier_url || null, courrier_header || null, courrier_footer || null, auth.user.organization_id]
    );

    logAudit(auth, 'settings.branding_update', 'organization', auth.user.organization_id!, {}, getIpFromRequest(req));

    return NextResponse.json({ success: true, message: 'Branding mis à jour' });
  } catch (err: any) {
    return erreurServeur('organization/branding', err);
  }
}
