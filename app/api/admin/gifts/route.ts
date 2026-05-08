import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query, withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const result = await query(`
      SELECT g.*, o.name as org_name, u.email as granted_by_email
      FROM admin_gifts g
      LEFT JOIN organizations o ON g.organization_id = o.id
      LEFT JOIN users u ON g.granted_by = u.id
      ORDER BY g.created_at DESC LIMIT 50
    `);
    return NextResponse.json({ gifts: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { organization_id, gift_type, credits_amount, plan_slug, plan_days, reason } = await req.json();
    if (!organization_id || !gift_type) return NextResponse.json({ error: "Champs requis" }, { status: 400 });

    // Validate credits_amount is positive for credit gifts
    if (gift_type === "credits" && (!credits_amount || credits_amount <= 0)) {
      return NextResponse.json({ error: "Le montant de crédits doit être positif" }, { status: 400 });
    }

    await withTransaction(async (client) => {
      if (gift_type === "credits" && credits_amount > 0) {
        await client.query(
          "UPDATE organizations SET credits_balance = credits_balance + $1, updated_at = now() WHERE id = $2",
          [credits_amount, organization_id]
        );
        await client.query(
          "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'gift', $4)",
          [organization_id, auth.user.id, credits_amount, reason || "Cadeau admin"]
        );
      }

      if (gift_type === "free_plan" && plan_slug) {
        const plan = await client.query("SELECT * FROM plans WHERE slug = $1", [plan_slug]);
        if (plan.rows[0]) {
          const p = plan.rows[0];
          const expiresAt = plan_days ? new Date(Date.now() + plan_days * 86400000).toISOString() : null;
          await client.query(
            `UPDATE organizations SET subscription_plan = $1, monthly_searches_limit = $2, max_users = $3,
             subscription_started_at = now(), subscription_expires_at = $4, updated_at = now() WHERE id = $5`,
            [plan_slug, p.monthly_searches_limit, p.included_users, expiresAt, organization_id]
          );
        }
      }

      await client.query(
        "INSERT INTO admin_gifts (organization_id, gift_type, credits_amount, plan_slug, plan_days, reason, granted_by) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [organization_id, gift_type, credits_amount || 0, plan_slug, plan_days, reason, auth.user.id]
      );
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err: any) {
    console.error('[ADMIN GIFTS]', err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
