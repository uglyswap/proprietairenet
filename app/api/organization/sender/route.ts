import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permissions";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET - Récupérer le profil expéditeur de l'organisation
export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      `SELECT sender_civilite, sender_first_name, sender_last_name, sender_company,
        sender_address, sender_address2, sender_postal_code, sender_city,
        sender_country, sender_phone
      FROM organizations WHERE id = $1`,
      [auth.user.organization_id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Organisation non trouvée" }, { status: 404 });
    }

    return NextResponse.json({ sender: result.rows[0] });
  } catch (err: any) {
    console.error("[SENDER GET]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}

// PUT - Mettre à jour le profil expéditeur
export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    // Seuls owner/admin de l'org ou un role disposant de settings.edit peuvent modifier
    // le profil expediteur (les admins plateforme passent via checkPermission).
    const permError = await checkPermission(auth, "settings.edit");
    if (permError) return permError;

    const body = await req.json();
    const {
      sender_civilite,
      sender_first_name,
      sender_last_name,
      sender_company,
      sender_address,
      sender_address2,
      sender_postal_code,
      sender_city,
      sender_country,
      sender_phone,
    } = body;

    await query(
      `UPDATE organizations SET
        sender_civilite = $1,
        sender_first_name = $2,
        sender_last_name = $3,
        sender_company = $4,
        sender_address = $5,
        sender_address2 = $6,
        sender_postal_code = $7,
        sender_city = $8,
        sender_country = $9,
        sender_phone = $10,
        updated_at = now()
      WHERE id = $11`,
      [
        sender_civilite || null,
        sender_first_name || null,
        sender_last_name || null,
        sender_company || null,
        sender_address || null,
        sender_address2 || null,
        sender_postal_code || null,
        sender_city || null,
        sender_country || 'FRANCE',
        sender_phone || null,
        auth.user.organization_id,
      ]
    );

    return NextResponse.json({ success: true, message: "Profil expéditeur mis à jour" });
  } catch (err: any) {
    console.error("[SENDER PUT]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
