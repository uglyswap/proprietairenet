import { NextResponse } from "next/server";
import { query, getColonnes } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Plans table: price is numeric (euros), not price_ht (centimes)
    //
    // Les colonnes de quota en resultats (migration 007) ne sont demandees que
    // si elles existent : les nommer sans precaution leverait un 42703 et
    // ferait tomber la page tarifs entiere, alors qu'elle sait fonctionner sans.
    const colonnesPlans = await getColonnes('plans');
    const colonnesQuota = ['monthly_results_limit', 'max_results_per_search'].filter((c) =>
      colonnesPlans.has(c)
    );

    const plansResult = await query(
      `SELECT id, name, slug, description, price, monthly_searches_limit,
              included_users, extra_user_price, features, sort_order
              ${colonnesQuota.length > 0 ? ', ' + colonnesQuota.join(', ') : ''}
         FROM plans
        WHERE is_active = true
        ORDER BY sort_order ASC`
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
