import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query, withTransaction } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    // Une organisation est requise : tous les effets du code (credits, plan) s'appliquent a l'org
    const organizationId = auth.user.organization_id;
    if (!organizationId) {
      return NextResponse.json({ error: "Aucune organisation associée" }, { status: 403 });
    }

    const { code } = await req.json();
    if (!code || typeof code !== "string") return NextResponse.json({ error: "Code requis" }, { status: 400 });

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

      // Unicite au niveau ORGANISATION : un code ne peut etre applique qu'une fois par org
      // (les effets credits/plan modifient l'org, pas l'utilisateur). Le verrou FOR UPDATE
      // ci-dessus serialise les applications concurrentes du meme code et empeche le double-usage.
      const usedResult = await client.query(
        "SELECT id FROM promo_code_uses WHERE promo_code_id = $1 AND organization_id = $2",
        [promo.id, organizationId]
      );
      if (usedResult.rows.length > 0) throw Object.assign(new Error("Code déjà utilisé"), { statusCode: 400 });

      let message = "";

      if (promo.type === "credits" && promo.credits_amount > 0) {
        await client.query(
          "UPDATE organizations SET credits_balance = credits_balance + $1 WHERE id = $2",
          [promo.credits_amount, organizationId]
        );
        await client.query(
          "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'promo', $4)",
          [organizationId, auth.user.id, promo.credits_amount, "Code promo: " + code]
        );
        message = promo.credits_amount + " crédits ajoutés !";
      }

      if (promo.type === "free_plan" && promo.free_plan_slug) {
        const plan = await client.query("SELECT * FROM plans WHERE slug = $1", [promo.free_plan_slug]);
        if (plan.rows[0]) {
          const p = plan.rows[0];
          // Expiration : on pose subscription_expires_at = maintenant + free_plan_days (defaut 30j).
          // La date est bien persistee ici ; c'est la couche de lecture du plan (verification d'acces)
          // qui doit comparer subscription_expires_at a NOW() pour faire expirer le plan.
          const expiresAt = new Date(Date.now() + (promo.free_plan_days || 30) * 86400000).toISOString();
          await client.query(
            `UPDATE organizations SET subscription_plan = $1, monthly_searches_limit = $2, max_users = $3,
             subscription_started_at = now(), subscription_expires_at = $4 WHERE id = $5`,
            [promo.free_plan_slug, p.monthly_searches_limit, p.included_users, expiresAt, organizationId]
          );
          message = "Plan " + p.name + " activé pour " + (promo.free_plan_days || 30) + " jours !";
        }
      }

      if (promo.type === "stripe_discount") {
        // Aucune liaison Stripe n'est effectuee ici (le coupon n'est pas attache au client) et les
        // limites locales (max_uses, expires_at) ne sont pas repercutees cote Stripe. Message honnete :
        // on enregistre l'usage du code sans promettre une application automatique au prochain paiement.
        message = "Code enregistré. La réduction sera à appliquer lors de la souscription via Stripe.";
      }

      // Record usage and increment counter atomically (within the transaction)
      await client.query(
        "INSERT INTO promo_code_uses (promo_code_id, user_id, organization_id) VALUES ($1, $2, $3)",
        [promo.id, auth.user.id, organizationId]
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
