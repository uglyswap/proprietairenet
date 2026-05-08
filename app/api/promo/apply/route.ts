import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query, withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { code } = await req.json();
    if (!code) return NextResponse.json({ error: "Code requis" }, { status: 400 });

    const result = await withTransaction(async (client) => {
      // Lock the promo code row to prevent concurrent usage
      const promoResult = await client.query(
        "SELECT * FROM promo_codes WHERE code = $1 AND is_active = true FOR UPDATE",
        [code.toUpperCase()]
      );
      const promo = promoResult.rows[0];

      if (!promo) throw Object.assign(new Error("Code invalide ou expiré"), { statusCode: 404 });
      if (promo.expires_at && new Date(promo.expires_at) < new Date()) throw Object.assign(new Error("Code expiré"), { statusCode: 400 });
      if (promo.max_uses && promo.current_uses >= promo.max_uses) throw Object.assign(new Error("Code épuisé"), { statusCode: 400 });

      // Check if already used by this user (with lock to prevent double-use)
      const usedResult = await client.query(
        "SELECT id FROM promo_code_uses WHERE promo_code_id = $1 AND user_id = $2",
        [promo.id, auth.user.id]
      );
      if (usedResult.rows.length > 0) throw Object.assign(new Error("Code déjà utilisé"), { statusCode: 400 });

      let message = "";

      if (promo.type === "credits" && promo.credits_amount > 0) {
        await client.query(
          "UPDATE organizations SET credits_balance = credits_balance + $1 WHERE id = $2",
          [promo.credits_amount, auth.user.organization_id]
        );
        await client.query(
          "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'promo', $4)",
          [auth.user.organization_id, auth.user.id, promo.credits_amount, "Code promo: " + code]
        );
        message = promo.credits_amount + " crédits ajoutés !";
      }

      if (promo.type === "free_plan" && promo.free_plan_slug) {
        const plan = await client.query("SELECT * FROM plans WHERE slug = $1", [promo.free_plan_slug]);
        if (plan.rows[0]) {
          const p = plan.rows[0];
          const expiresAt = new Date(Date.now() + (promo.free_plan_days || 30) * 86400000).toISOString();
          await client.query(
            `UPDATE organizations SET subscription_plan = $1, monthly_searches_limit = $2, max_users = $3,
             subscription_started_at = now(), subscription_expires_at = $4 WHERE id = $5`,
            [promo.free_plan_slug, p.monthly_searches_limit, p.included_users, expiresAt, auth.user.organization_id]
          );
          message = "Plan " + p.name + " activé pour " + (promo.free_plan_days || 30) + " jours !";
        }
      }

      if (promo.type === "stripe_discount") {
        message = "Réduction appliquée ! Elle sera prise en compte lors de votre prochain paiement.";
      }

      // Record usage and increment counter atomically (within the transaction)
      await client.query(
        "INSERT INTO promo_code_uses (promo_code_id, user_id, organization_id) VALUES ($1, $2, $3)",
        [promo.id, auth.user.id, auth.user.organization_id]
      );
      await client.query("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1", [promo.id]);

      return { message, type: promo.type };
    });

    return NextResponse.json({ success: true, message: result.message, type: result.type });
  } catch (err: any) {
    const statusCode = err.statusCode || 500;
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: statusCode });
  }
}
