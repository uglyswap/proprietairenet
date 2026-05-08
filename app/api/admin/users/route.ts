import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const result = await query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_admin, u.created_at, u.last_login,
        o.name as org_name, o.subscription_plan, o.id as organization_id,
        (SELECT count(*) FROM search_history WHERE user_id = u.id) as search_count
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      ORDER BY u.created_at DESC
    `);

    return NextResponse.json({ users: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
