import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const plansResult = await query(
      "SELECT id, name, slug, description, price_ht, currency, interval, monthly_searches_limit, included_users, extra_user_price, features, sort_order FROM plans WHERE is_active = true ORDER BY sort_order ASC"
    );

    const packsResult = await query(
      "SELECT id, name, credits, price, currency, sort_order FROM credit_packs WHERE is_active = true ORDER BY sort_order ASC"
    );

    return NextResponse.json({ plans: plansResult.rows, credit_packs: packsResult.rows });
  } catch (err: any) {
    console.error("[PLANS]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
