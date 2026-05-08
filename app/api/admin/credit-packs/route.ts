import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import stripe from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const result = await query("SELECT * FROM credit_packs ORDER BY sort_order ASC");
    return NextResponse.json({ credit_packs: result.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json();
    const { name, credits, price } = body;

    if (!name || !credits || !price) return NextResponse.json({ error: "Champs requis" }, { status: 400 });

    // Find or create credits product
    let productsResult = await query("SELECT stripe_product_id FROM credit_packs WHERE stripe_product_id IS NOT NULL LIMIT 1");
    let productId = productsResult.rows[0]?.stripe_product_id;

    if (!productId) {
      const product = await stripe.products.create({ name: "Crédits d'enrichissement", metadata: { type: "credits" } });
      productId = product.id;
    }

    const stripePrice = await stripe.prices.create({
      product: productId,
      unit_amount: price,
      currency: "eur",
      tax_behavior: "exclusive",
      metadata: { credits: String(credits) },
    });

    const maxSort = await query("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_sort FROM credit_packs");

    const result = await query(
      `INSERT INTO credit_packs (name, credits, price, stripe_product_id, stripe_price_id, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, credits, price, productId, stripePrice.id, maxSort.rows[0].next_sort]
    );

    return NextResponse.json({ credit_pack: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await req.json();
    const { id, name, credits, price, is_active } = body;
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    // If price changed, create new Stripe price
    if (price !== undefined) {
      const existing = await query("SELECT * FROM credit_packs WHERE id = $1", [id]);
      const pack = existing.rows[0];
      if (pack && pack.stripe_product_id) {
        const newPrice = await stripe.prices.create({
          product: pack.stripe_product_id,
          unit_amount: price,
          currency: "eur",
          tax_behavior: "exclusive",
          metadata: { credits: String(credits || pack.credits) },
        });
        await query("UPDATE credit_packs SET stripe_price_id = $1 WHERE id = $2", [newPrice.id, id]);
      }
    }

    const sets = [];
    const values: any[] = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx}`); values.push(name); idx++; }
    if (credits !== undefined) { sets.push(`credits = $${idx}`); values.push(credits); idx++; }
    if (price !== undefined) { sets.push(`price = $${idx}`); values.push(price); idx++; }
    if (is_active !== undefined) { sets.push(`is_active = $${idx}`); values.push(is_active); idx++; }
    sets.push("updated_at = now()");
    values.push(id);

    await query(`UPDATE credit_packs SET ${sets.join(", ")} WHERE id = $${idx}`, values);

    const result = await query("SELECT * FROM credit_packs WHERE id = $1", [id]);
    return NextResponse.json({ credit_pack: result.rows[0] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    await query("UPDATE credit_packs SET is_active = false, updated_at = now() WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
