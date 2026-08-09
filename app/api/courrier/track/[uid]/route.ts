import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

const SP_API_URL = process.env.SERVICE_POSTAL_API_URL || "https://prod-api.servicepostal.com";
const SP_API_KEY = process.env.SERVICE_POSTAL_API_KEY || "";

export async function GET(
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

    // Verify this mail belongs to the org
    const mailResult = await query(
      "SELECT id FROM mail_history WHERE service_postal_uid = $1 AND organization_id = $2",
      [uid, auth.user.organization_id]
    );

    if (mailResult.rows.length === 0) {
      return NextResponse.json({ error: "Courrier non trouvé" }, { status: 404 });
    }

    if (!SP_API_KEY) {
      return NextResponse.json({ error: "Service courrier non configuré" }, { status: 503 });
    }

    // Call Service Postal tracking endpoint
    const spResponse = await fetch(`${SP_API_URL}/lettres/${uid}/suivi`, {
      method: "GET",
      headers: {
        "apiKey": SP_API_KEY,
      },
    });

    const spResult = await spResponse.json();

    if (!spResponse.ok) {
      console.error("[COURRIER TRACK] Service Postal error:", spResult);
      return NextResponse.json({
        error: spResult.message || spResult.erreur || "Erreur de suivi",
        details: spResult,
      }, { status: spResponse.status });
    }

    // Update tracking data in mail_history
    await query(
      "UPDATE mail_history SET tracking_data = $1, updated_at = now() WHERE service_postal_uid = $2 AND organization_id = $3",
      [JSON.stringify(spResult), uid, auth.user.organization_id]
    );

    // Map Service Postal events to our status progression
    const events = spResult.evenements || [];
    
    // Status priority (higher = more advanced in the lifecycle)
    const STATUS_PRIORITY: Record<string, number> = {
      'preview': 0,
      'sent': 1,  // order placed, in production
      'courrier_produit': 2,  // printed, enveloped, stamped
      'pris_en_charge': 3,  // La Poste has it
      'attente_retrait_guichet': 4,  // waiting at post office
      'distribue_destinataire': 5,  // delivered
      'retour_expediteur': 5,  // returned (terminal)
    };

    // Find the most advanced status from events
    let bestStatus = 'sent';
    for (const evt of events) {
      const code = evt.code_statut;
      if (code === 'distribue_destinataire' || code === 'distribue_destinataire_en_lot') {
        if ((STATUS_PRIORITY['distribue_destinataire'] || 0) > (STATUS_PRIORITY[bestStatus] || 0)) bestStatus = 'distribue_destinataire';
      } else if (code === 'distribue_expediteur' || code === 'retour_expediteur') {
        bestStatus = 'retour_expediteur';
      } else if (STATUS_PRIORITY[code] !== undefined && (STATUS_PRIORITY[code] || 0) > (STATUS_PRIORITY[bestStatus] || 0)) {
        bestStatus = code;
      }
    }

    // Update status in DB (only advance, never go back)
    await query(
      `UPDATE mail_history SET status = $1, updated_at = now() 
       WHERE service_postal_uid = $2 AND organization_id = $3
       AND status NOT IN ('distribue_destinataire', 'retour_expediteur', 'cancelled')`,
      [bestStatus, uid, auth.user.organization_id]
    );

    const isDelivered = bestStatus === 'distribue_destinataire';

    return NextResponse.json({
      uid,
      numero_suivi: spResult.numero_suivi_laposte || null,
      evenements: events.map((e: any) => ({
        ...e,
        label: ({
          'soumis': 'Commande soumise',
          'courrier_produit': 'Imprimé, mis sous pli et affranchi',
          'pris_en_charge': 'Pris en charge par La Poste',
          'distribue_destinataire': 'Distribué au destinataire',
          'distribue_destinataire_en_lot': 'Distribué au destinataire',
          'distribue_expediteur': 'Retourné à l\'expéditeur',
          'retour_expediteur': 'Retourné à l\'expéditeur',
          'attente_retrait_guichet': 'En attente de retrait au guichet',
          'ar_scanne': 'Accusé de réception scanné',
        } as Record<string, string>)[e.code_statut] || e.message_statut || e.code_statut,
      })),
      status: bestStatus,
      is_delivered: isDelivered,
    });
  } catch (err: any) {
    console.error("[COURRIER TRACK]", err);
    return erreurServeur('courrier/track/[uid]', err);
  }
}
