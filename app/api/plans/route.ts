import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Plans table: price is numeric (euros), not price_ht (centimes)
    const plansResult = await query(
      "SELECT id, name, slug, description, price, monthly_searches_limit, included_users, extra_user_price, features, sort_order FROM plans WHERE is_active = true ORDER BY sort_order ASC"
    );

    // Convert price from numeric to euros for display
    const plans = plansResult.rows.map((p: any) => ({
      ...p,
      price_euros: parseFloat(p.price),
    }));

    // Credit packs: price is numeric (euros)
    const packsResult = await query(
      "SELECT id, name, credits, price, sort_order FROM credit_packs WHERE is_active = true ORDER BY sort_order ASC"
    );

    const credit_packs = packsResult.rows.map((p: any) => ({
      ...p,
      price_euros: parseFloat(p.price),
    }));

    return NextResponse.json({ plans, credit_packs });
  } catch (err: any) {
    console.error("[PLANS]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
