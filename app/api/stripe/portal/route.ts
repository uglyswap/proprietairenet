import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { createPortalSession } from "@/lib/stripe";
import { query } from "@/lib/db";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const orgResult = await query("SELECT stripe_customer_id FROM organizations WHERE id = $1", [auth.user.organization_id]);
    const org = orgResult.rows[0];

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ error: "Pas d'abonnement actif" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://proprietaire.net";
    const session = await createPortalSession(org.stripe_customer_id, `${baseUrl}/dashboard`);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[STRIPE PORTAL]", err);
    return erreurServeur('stripe/portal', err);
  }
}
