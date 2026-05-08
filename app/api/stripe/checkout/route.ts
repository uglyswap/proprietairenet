import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import stripe, { getOrCreateStripeCustomer, createCheckoutSession, getPlanBySlug, addCredits } from "@/lib/stripe";
import { query } from "@/lib/db";
import { logAudit, getIpFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Discount tiers for credits
function getDiscountedPriceCents(credits: number): number {
  const baseEur = credits / 100; // 100 credits = 1€
  let finalEur: number;
  if (credits >= 200000) finalEur = Math.round(baseEur * 0.85); // -15%
  else if (credits >= 60000) finalEur = Math.round(baseEur * 0.90); // -10%
  else finalEur = baseEur;
  return finalEur * 100; // cents
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) {
      return NextResponse.json({ error }, { status: status || 401 });
    }

    const body = await req.json();
    
    logAudit(auth, "stripe.checkout", "payment", null, { amount: body.credits || body.plan_slug }, getIpFromRequest(req));
    const { type, plan_slug, credit_pack_id, extra_users, credits: customCredits, billing_period } = body;

    const customerId = await getOrCreateStripeCustomer(
      auth.user.organization_id,
      auth.user.email,
      auth.user.first_name
    );

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://proprietaire.net";

    if (type === "subscription") {
      const plan = await getPlanBySlug(plan_slug);
      if (!plan || !plan.stripe_price_id) {
        return NextResponse.json({ error: "Plan non trouvé" }, { status: 404 });
      }

      // Handle annual billing if requested
      let priceId = plan.stripe_price_id;
      if (billing_period === "annual" && plan.stripe_annual_price_id) {
        priceId = plan.stripe_annual_price_id;
      }

      const session = await createCheckoutSession({
        customerId,
        priceId,
        orgId: auth.user.organization_id,
        userId: auth.user.id,
        successUrl: `${baseUrl}/dashboard?payment=success`,
        cancelUrl: `${baseUrl}/pricing?payment=cancelled`,
        extraUsers: extra_users || 0,
        extraUserPriceId: plan.stripe_extra_user_price_id || undefined,
      });

      return NextResponse.json({ url: session.url });

    } else if (type === "credits") {
      // Legacy: fixed credit pack by ID
      const packResult = await query("SELECT * FROM credit_packs WHERE id = $1 AND is_active = true", [credit_pack_id]);
      const pack = packResult.rows[0];
      if (!pack) {
        return NextResponse.json({ error: "Pack de crédits non trouvé" }, { status: 404 });
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: `${pack.credits.toLocaleString('fr-FR')} crédits courrier`,
              description: `Pack ${pack.name} — Proprietaire.net`,
            },
            unit_amount: (parseInt(pack.price) * 100),
            tax_behavior: "inclusive" as const,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/dashboard?credits=success`,
        cancel_url: `${baseUrl}/pricing?credits=cancelled`,
        metadata: {
          organization_id: auth.user.organization_id,
          user_id: auth.user.id,
          credits: String(pack.credits),
          type: "credit_purchase",
        },
        invoice_creation: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
        tax_id_collection: { enabled: true },
      });

      return NextResponse.json({ url: session.url });

    } else if (type === "custom_credits") {
      // New: flexible credit amount
      const credits = parseInt(customCredits);
      if (!credits || credits < 1000 || credits > 500000) {
        return NextResponse.json({ error: "Montant de crédits invalide (min 1 000, max 500 000)" }, { status: 400 });
      }

      // Round to nearest 1000
      const roundedCredits = Math.ceil(credits / 1000) * 1000;
      const priceCents = getDiscountedPriceCents(roundedCredits);
      const priceEur = priceCents / 100;

      // Build label
      let discountLabel = "";
      if (roundedCredits >= 200000) discountLabel = " (Megapack -15%)";
      else if (roundedCredits >= 60000) discountLabel = " (-10%)";

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: {
              name: `${roundedCredits.toLocaleString('fr-FR')} crédits courrier${discountLabel}`,
              description: `Crédits pour envoi de courriers postaux — Proprietaire.net`,
            },
            unit_amount: priceCents,
            tax_behavior: "inclusive" as const,
          },
          quantity: 1,
        }],
        success_url: `${baseUrl}/dashboard?credits=success`,
        cancel_url: `${baseUrl}/pricing?credits=cancelled`,
        metadata: {
          organization_id: auth.user.organization_id,
          user_id: auth.user.id,
          credits: String(roundedCredits),
          type: "credit_purchase",
        },
        invoice_creation: { enabled: true },
        customer_update: { name: "auto", address: "auto" },
        tax_id_collection: { enabled: true },
      });

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Type de paiement invalide" }, { status: 400 });
  } catch (err: any) {
    console.error("[STRIPE CHECKOUT]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
