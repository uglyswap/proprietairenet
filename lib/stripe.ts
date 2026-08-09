import Stripe from "stripe";
import { query, getColonnes } from "./db";
import { crediterCreditsAutonome } from "./credits";

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
    // Note: 'invoice_settings' n'est pas un parametre valide de checkout.sessions.create
    // (l'API Stripe le rejette a l'execution et il cassait le typecheck). Le libelle
    // produit doit etre porte par le Product/Price Stripe, pas ici.
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

/**
 * Valeurs acceptees par organizations_subscription_plan_check.
 *
 * Deux referentiels de plans coexistent sans point de contact : `plans.slug`
 * vaut 'gratuit' et 'pro', tandis que `organizations.subscription_plan` est
 * contraint a 'free', 'starter', 'pro' ou 'enterprise'. Activer un abonnement
 * sur le plan 'gratuit' violait donc la contrainte, en HTTP 500, et toutes les
 * jointures entre les deux tables etaient vides (MRR affiche a 0).
 *
 * On normalise ici plutot que de laisser remonter une violation de contrainte.
 */
const PLANS_AUTORISES = new Set(['free', 'starter', 'pro', 'enterprise']);

const ALIAS_PLANS: Record<string, string> = {
  gratuit: 'free',
  freemium: 'free',
  professionnel: 'pro',
};

export function normaliserPlanSlug(slug: string): string {
  const normalise = ALIAS_PLANS[slug] ?? slug;
  if (!PLANS_AUTORISES.has(normalise)) {
    throw new Error(
      `Plan "${slug}" incompatible avec organizations_subscription_plan_check ` +
        `(valeurs acceptees : ${[...PLANS_AUTORISES].join(', ')})`
    );
  }
  return normalise;
}

export async function activateSubscription(orgId: string, subscriptionId: string, planSlug: string) {
  const plan = await getPlanBySlug(planSlug);
  if (!plan) throw new Error("Plan not found: " + planSlug);

  const slugCanonique = normaliserPlanSlug(planSlug);

  await query(
    `UPDATE organizations SET subscription_plan = $1, stripe_subscription_id = $2,
     monthly_searches_limit = $3, max_users = $4, updated_at = now() WHERE id = $5`,
    [slugCanonique, subscriptionId, plan.monthly_searches_limit, plan.included_users, orgId]
  );
}

export async function cancelSubscription(orgId: string) {
  await query(
    `UPDATE organizations SET subscription_plan = 'free', stripe_subscription_id = NULL,
     monthly_searches_limit = 10, max_users = 1, updated_at = now() WHERE id = $1`,
    [orgId]
  );
}

/**
 * Cree des credits a la suite d'un achat.
 *
 * L'ancienne version enchainait deux requetes hors transaction : une coupure
 * entre les deux laissait un solde credite sans ligne de journal, ou l'inverse.
 * Tout passe desormais par lib/credits, qui ecrit le solde et le journal dans
 * la meme transaction et refuse de rejouer une reference deja traitee.
 */
export async function addCredits(
  orgId: string,
  userId: string,
  credits: number,
  description: string,
  options: { reference?: string; montantEurCentimes?: number } = {}
) {
  await crediterCreditsAutonome({
    organizationId: orgId,
    userId,
    montant: credits,
    type: 'purchase',
    description,
    reference: options.reference,
    montantEurCentimes: options.montantEurCentimes,
  });
}

/**
 * Retrouve le plan correspondant a un identifiant de prix Stripe.
 *
 * Le tunnel d'achat propose un tarif annuel (`stripe_annual_price_id`) mais le
 * webhook ne cherchait que dans `stripe_price_id` : un abonnement annuel etait
 * encaisse par Stripe et jamais active dans le produit. Le client payait un an
 * et n'obtenait rien.
 *
 * La colonne annuelle fait partie des colonnes attendues par le code et absentes
 * de la production : on ne l'interroge que si elle existe.
 */
export async function findPlanByStripePriceId(priceId: string) {
  if (!priceId) return null;

  const colonnes = await getColonnes('plans');
  const aColonneAnnuelle = colonnes.has('stripe_annual_price_id');

  const result = await query(
    aColonneAnnuelle
      ? `SELECT *, (stripe_annual_price_id = $1) AS est_annuel
           FROM plans
          WHERE stripe_price_id = $1 OR stripe_annual_price_id = $1
          LIMIT 1`
      : `SELECT *, false AS est_annuel
           FROM plans
          WHERE stripe_price_id = $1
          LIMIT 1`,
    [priceId]
  );

  return result.rows[0] || null;
}

export async function updatePlan(planId: string, data: Partial<{
  name: string; description: string; price_ht: number; monthly_searches_limit: number;
  included_users: number; extra_user_price: number; features: string[]; is_active: boolean; sort_order: number;
}>) {
  // Whitelist stricte des colonnes modifiables: les noms de colonnes ne peuvent
  // pas etre parametres en SQL, donc on n'interpole QUE des identifiants connus.
  // Toute cle hors de cette liste (ex: injectee via le body de la requete) est ignoree.
  const ALLOWED_COLUMNS = new Set([
    "name", "description", "price_ht", "monthly_searches_limit",
    "included_users", "extra_user_price", "features", "is_active", "sort_order",
  ]);

  const sets: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!ALLOWED_COLUMNS.has(key)) continue; // anti-injection d'identifiant SQL
    if (key === "features") {
      sets.push(`features = $${idx}::jsonb`);
      values.push(JSON.stringify(value));
    } else {
      sets.push(`${key} = $${idx}`);
      values.push(value);
    }
    idx++;
  }

  if (sets.length === 0) return; // rien a mettre a jour
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
