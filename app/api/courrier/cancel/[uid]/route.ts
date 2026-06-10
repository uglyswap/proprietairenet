import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const { uid } = params;

    if (!uid) {
      return NextResponse.json({ error: "UID requis" }, { status: 400 });
    }

    const orgId = auth.user.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "Aucune organisation associée" }, { status: 400 });
    }

    // Verify this mail belongs to the org
    const mailResult = await query(
      "SELECT * FROM mail_history WHERE service_postal_uid = $1 AND organization_id = $2",
      [uid, orgId]
    );

    if (mailResult.rows.length === 0) {
      return NextResponse.json({ error: "Courrier non trouvé" }, { status: 404 });
    }

    const mail = mailResult.rows[0];

    if (mail.status === 'cancelled') {
      return NextResponse.json({ error: "Courrier déjà annulé" }, { status: 400 });
    }

    if (mail.status === 'delivered') {
      return NextResponse.json({ error: "Impossible d'annuler un courrier déjà distribué" }, { status: 400 });
    }

    if (!SP_API_KEY) {
      return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });
    }

    // Claim ATOMIQUE de l'annulation: transitionne vers 'cancelling' uniquement si le
    // courrier n'est pas deja annule/en cours d'annulation/distribue. Deux requetes
    // concurrentes ne peuvent pas rembourser deux fois (anti double-refund): une seule
    // obtient la ligne.
    const prevStatus = mail.status;
    const claim = await query(
      "UPDATE mail_history SET status = 'cancelling', updated_at = now() WHERE service_postal_uid = $1 AND organization_id = $2 AND status NOT IN ('cancelled','cancelling','delivered') RETURNING id",
      [uid, orgId]
    );
    if (claim.rows.length === 0) {
      return NextResponse.json({ error: "Courrier déjà annulé ou en cours d'annulation" }, { status: 409 });
    }

    // Call Service Postal cancel endpoint
    const spResponse = await fetch(`${SP_API_URL}/lettres/${uid}/annuler`, {
      method: "DELETE",
      headers: {
        "apiKey": SP_API_KEY,
      },
    });

    const spResult = await spResponse.json();

    if (!spResponse.ok) {
      // Annulation refusee par Service Postal: remettre le courrier dans son etat precedent.
      await query(
        "UPDATE mail_history SET status = $1, updated_at = now() WHERE service_postal_uid = $2 AND organization_id = $3 AND status = 'cancelling'",
        [prevStatus, uid, orgId]
      );
      console.error("[COURRIER CANCEL] Service Postal error:", spResult);
      return NextResponse.json({
        error: spResult.message || spResult.erreur || "Impossible d'annuler ce courrier",
        details: spResult,
      }, { status: spResponse.status });
    }

    // Refund credits if the mail was sent (exactement une fois, garanti par le claim).
    if (prevStatus === 'sent' && mail.credits_used > 0) {
      await query(
        "UPDATE organizations SET credits_balance = credits_balance + $1, credits_used = credits_used - $1, updated_at = now() WHERE id = $2",
        [mail.credits_used, orgId]
      );
      await query(
        "INSERT INTO credit_transactions (organization_id, user_id, amount, type, description) VALUES ($1, $2, $3, 'refund', $4)",
        [orgId, auth.user.id, mail.credits_used, `Annulation courrier ${uid}`]
      );
    }

    // Finaliser le statut
    await query(
      "UPDATE mail_history SET status = 'cancelled', updated_at = now() WHERE service_postal_uid = $1 AND organization_id = $2",
      [uid, orgId]
    );

    return NextResponse.json({
      success: true,
      uid,
      credits_refunded: prevStatus === 'sent' ? mail.credits_used : 0,
      message: "Courrier annulé avec succès",
    });
  } catch (err: any) {
    console.error("[COURRIER CANCEL]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
