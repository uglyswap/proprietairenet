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
      SELECT o.*, count(u.id) as user_count,
        (SELECT count(*) FROM search_history WHERE organization_id = o.id) as total_searches,
        (SELECT COALESCE(sum(amount), 0) FROM credit_transactions WHERE organization_id = o.id AND type = 'purchase') as total_credits_purchased
      FROM organizations o
      LEFT JOIN users u ON u.organization_id = o.id
      GROUP BY o.id ORDER BY o.created_at DESC
    `);

    return NextResponse.json({ organizations: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { id, subscription_plan, credits_balance, monthly_searches_limit, max_users } = await req.json();
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const sets: string[] = []; const vals: any[] = []; let idx = 1;
    if (subscription_plan !== undefined) { sets.push(`subscription_plan = $${idx}`); vals.push(subscription_plan); idx++; }
    if (credits_balance !== undefined) { sets.push(`credits_balance = $${idx}`); vals.push(credits_balance); idx++; }
    if (monthly_searches_limit !== undefined) { sets.push(`monthly_searches_limit = $${idx}`); vals.push(monthly_searches_limit); idx++; }
    if (max_users !== undefined) { sets.push(`max_users = $${idx}`); vals.push(max_users); idx++; }
    sets.push("updated_at = now()");
    vals.push(id);

    await query(`UPDATE organizations SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    const result = await query("SELECT * FROM organizations WHERE id = $1", [id]);
    return NextResponse.json({ organization: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
