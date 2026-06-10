import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import stripe, { updatePlan } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// GET: List all plans (admin only)
export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const result = await query("SELECT * FROM plans ORDER BY sort_order ASC");
    return NextResponse.json({ plans: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create a new plan
export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json();
    const { name, slug, description, price, monthly_searches_limit, included_users, extra_user_price, features } = body;

    if (!name || !slug) return NextResponse.json({ error: "Nom et slug requis" }, { status: 400 });

    let stripeProductId = null;
    let stripePriceId = null;

    // Create Stripe product and price if paid plan
    if (price > 0) {
      const product = await stripe.products.create({
        name,
        description: description || undefined,
        metadata: { plan_slug: slug },
      });
      stripeProductId = product.id;

      // Renomme pour ne pas masquer la variable 'price' du body (sinon TDZ:
      // 'price' utilise avant sa declaration -> creation de plan payant impossible).
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: price,
        currency: "eur",
        recurring: { interval: "month" },
        tax_behavior: "exclusive",
      });
      stripePriceId = stripePrice.id;
    }

    const maxSort = await query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM plans");
    const sortOrder = maxSort.rows[0].next_sort;

    const result = await query(
      `INSERT INTO plans (name, slug, description, price, monthly_searches_limit, included_users, extra_user_price, stripe_product_id, stripe_price_id, features, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11) RETURNING *`,
      [name, slug, description, price || 0, monthly_searches_limit || 10, included_users || 1, extra_user_price || 0, stripeProductId, stripePriceId, JSON.stringify(features || []), sortOrder]
    );

    return NextResponse.json({ plan: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT: Update a plan
export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    await updatePlan(id, data);

    const result = await query("SELECT * FROM plans WHERE id = $1", [id]);
    return NextResponse.json({ plan: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE: Deactivate a plan (soft delete)
export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    // Check plan is not "free" (cannot delete free plan)
    const plan = await query("SELECT slug FROM plans WHERE id = $1", [id]);
    if (plan.rows[0]?.slug === "free") {
      return NextResponse.json({ error: "Impossible de supprimer le plan gratuit" }, { status: 400 });
    }

    await query("UPDATE plans SET is_active = false, updated_at = now() WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
