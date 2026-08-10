import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import logger from "@/lib/logger";
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'courrier');
    if (refusPlan) return refusPlan;

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 100);
    const offset = (page - 1) * limit;
    const statusFilter = searchParams.get("status");

    let sql = `
      SELECT 
        mh.id, mh.service_postal_uid, mh.destinataire, mh.recipient_name, mh.recipient_address,
        mh.type_affranchissement, mh.couleur, mh.recto_verso, mh.status, mh.prix, mh.credits_used,
        mh.preview_url, mh.tracking_data, mh.template_id, mh.expediteur,
        mh.sent_at, mh.created_at, mh.updated_at,
        mt.name as template_name,
        u.first_name as user_first_name, u.last_name as user_last_name, u.email as user_email
      FROM mail_history mh
      LEFT JOIN mail_templates mt ON mh.template_id = mt.id
      LEFT JOIN users u ON mh.user_id = u.id
      WHERE mh.organization_id = $1
    `;
    const params: any[] = [auth.user.organization_id];

    if (statusFilter) {
      params.push(statusFilter);
      sql += ` AND mh.status = $${params.length}`;
    }

    // Get total count
    let countSql = "SELECT COUNT(*) FROM mail_history WHERE organization_id = $1";
    const countParams: any[] = [auth.user.organization_id];
    if (statusFilter) {
      countParams.push(statusFilter);
      countSql += ` AND status = $${countParams.length}`;
    }
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    sql += ` ORDER BY mh.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    return NextResponse.json({
      courriers: result.rows,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (err: any) {
    logger.error('COURRIER', 'History GET error', { error: err.message });
    return erreurServeur('courrier/history', err);
  }
}
