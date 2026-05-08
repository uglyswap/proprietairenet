import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Webhook called by FullEnrich when enrichment is complete
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.ENRICH_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = req.headers.get('authorization') || '';
      const querySecret = new URL(req.url).searchParams.get('secret') || '';
      if (authHeader !== `Bearer ${webhookSecret}` && querySecret !== webhookSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await req.json();
    const enrichmentId = body.id || body.enrichment_id;

    console.log("[ENRICH WEBHOOK] Received:", JSON.stringify(body).substring(0, 500));

    if (enrichmentId) {
      // Update enrichment status
      await query(
        "UPDATE enrichment_history SET status = 'completed', result_data = $1::jsonb, updated_at = now() WHERE fullenrich_id = $2",
        [JSON.stringify(body), enrichmentId]
      );
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[ENRICH WEBHOOK]", err);
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}
