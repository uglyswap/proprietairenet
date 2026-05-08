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

    const result = await query("SELECT * FROM promo_codes ORDER BY created_at DESC");
    return NextResponse.json({ promo_codes: result.rows });
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
    const { code, description, type, discount_type, discount_value, discount_duration, discount_months, credits_amount, free_plan_slug, free_plan_days, max_uses, expires_at } = body;

    if (!code || !type) return NextResponse.json({ error: "Code et type requis" }, { status: 400 });

    let stripeCouponId = null;

    if (type === "stripe_discount" && discount_value > 0) {
      const couponParams: any = { name: code, duration: discount_duration || "once" };
      if (discount_duration === "repeating" && discount_months) couponParams.duration_in_months = discount_months;
      if (discount_type === "percent") { couponParams.percent_off = discount_value; }
      else { couponParams.amount_off = discount_value; couponParams.currency = "eur"; }
      const coupon = await stripe.coupons.create(couponParams);
      await stripe.promotionCodes.create({ coupon: coupon.id, code: code.toUpperCase(), active: true });
      stripeCouponId = coupon.id;
    }

    const result = await query(
      `INSERT INTO promo_codes (code, description, type, discount_type, discount_value, discount_duration, discount_months, stripe_coupon_id, credits_amount, free_plan_slug, free_plan_days, max_uses, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [code.toUpperCase(), description, type, discount_type, discount_value || 0, discount_duration, discount_months, stripeCouponId, credits_amount || 0, free_plan_slug, free_plan_days || 30, max_uses, expires_at, auth.user.id]
    );

    return NextResponse.json({ promo_code: result.rows[0] }, { status: 201 });
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

    await query("UPDATE promo_codes SET is_active = false, updated_at = now() WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
