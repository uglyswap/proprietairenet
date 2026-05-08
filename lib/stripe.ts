import Stripe from "stripe";
import { query } from "./db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16" as any,
});

export default stripe;

export async function getPlans() {
  const result = await query("SELECT * FROM plans WHERE is_active = true ORDER BY sort_order ASC");
  return result.rows;
}

export async function getCreditPacks() {
  const result = await query("SELECT * FROM credit_packs WHERE is_active = true ORDER BY sort_order ASC");
  return result.rows;
}

export async function getPlanBySlug(slug: string) {
  const result = await query("SELECT * FROM plans WHERE slug = $1", [slug]);
  return result.rows[0] || null;
}

export async function getOrCreateStripeCustomer(orgId: string, email: string, name?: string) {
  const orgResult = await query("SELECT stripe_customer_id, name FROM organizations WHERE id = $1", [orgId]);
  const org = orgResult.rows[0];
  if (org?.stripe_customer_id) return org.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    name: name || org?.name || undefined,
    metadata: { organization_id: orgId },
  });

  await query("UPDATE organizations SET stripe_customer_id = $1, updated_at = now() WHERE id = $2", [customer.id, orgId]);
  return customer.id;
}

export async function createCheckoutSession(params: {
  customerId: string; priceId: string; orgId: string; userId: string;
  successUrl: string; cancelUrl: string; extraUsers?: number; extraUserPriceId?: string;
}) {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: params.priceId, quantity: 1 },
  ];
  if (params.extraUsers && params.extraUsers > 0 && params.extraUserPriceId) {
    lineItems.push({ price: params.extraUserPriceId, quantity: params.extraUsers });
  }

  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: "subscription",
    line_items: lineItems,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { organization_id: params.orgId, user_id: params.userId },
    subscription_data: { metadata: { organization_id: params.orgId } },
    tax_id_collection: { enabled: true },
    customer_update: { name: "auto", address: "auto" },
    allow_promotion_codes: true,
    invoice_settings: { custom_fields: [{ name: "Produit", value: "Proprietaire.net - Abonnement Pro" }] },
  });
}

export async function createCreditCheckoutSession(params: {
  customerId: string; priceId: string; credits: number; orgId: string;
  userId: string; successUrl: string; cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: "payment",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      organization_id: params.orgId, user_id: params.userId,
      credits: String(params.credits), type: "credit_purchase",
    },
  });
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  return stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

export async function activateSubscription(orgId: string, subscriptionId: string, planSlug: string) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan) throw new Error("Plan not found: " + planSlug);
  await query(
    `UPDATE organizations SET subscription_plan = $1, stripe_subscription_id = $2,
     monthly_searches_limit = $3, max_users = $4, updated_at = now() WHERE id = $5`,
    [planSlug, subscriptionId, plan.monthly_searches_limit, plan.included_users, orgId]
  );
}

export async function cancelSubscription(orgId: string) {
  await query(
    `UPDATE organizations SET subscription_plan = 'free', stripe_subscription_id = NULL,
     monthly_searches_limit = 10, max_users = 1, updated_at = now() WHERE id = $1`,
    [orgId]
  );
}

export async function addCredits(orgId: string, userId: string, credits: number, description: string) {
  await query("UPDATE organizations SET credits_balance = credits_balance + $1, updated_at = now() WHERE id = $2", [credits, orgId]);
  await query(
    "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)",
    [orgId, userId, credits, "purchase", description]
  );
}

export async function updatePlan(planId: string, data: Partial<{
  name: string; description: string; price_ht: number; monthly_searches_limit: number;
  included_users: number; extra_user_price: number; features: string[]; is_active: boolean; sort_order: number;
}>) {
  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (key === "features") {
        sets.push(`${key} = $${idx}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        sets.push(`${key} = $${idx}`);
        values.push(value);
      }
      idx++;
    }
  }
  sets.push("updated_at = now()");
  values.push(planId);

  await query(`UPDATE plans SET ${sets.join(", ")} WHERE id = $${idx}`, values);

  if (data.price_ht !== undefined) {
    const plan = await query("SELECT * FROM plans WHERE id = $1", [planId]);
    const p = plan.rows[0];
    if (p?.stripe_product_id && data.price_ht > 0) {
      const newPrice = await stripe.prices.create({
        product: p.stripe_product_id,
        unit_amount: data.price_ht,
        currency: p.currency || "eur",
        recurring: { interval: "month" },
        tax_behavior: "exclusive",
      });
      await query("UPDATE plans SET stripe_price_id = $1 WHERE id = $2", [newPrice.id, planId]);
    }
  }
}
