import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST - Toggle is_admin pour un utilisateur
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const userId = params.id;
    if (!userId) {
      return NextResponse.json({ error: "ID utilisateur requis" }, { status: 400 });
    }

    // Ne pas se dégrader soi-même
    if (userId === auth.user.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas modifier vos propres droits admin" }, { status: 400 });
    }

    // Vérifier que l'utilisateur existe
    const userResult = await query("SELECT id, email, is_admin FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "Utilisateur non trouvé" }, { status: 404 });
    }

    const targetUser = userResult.rows[0];
    const newAdminStatus = !targetUser.is_admin;

    await query(
      "UPDATE users SET is_admin = $1, updated_at = now() WHERE id = $2",
      [newAdminStatus, userId]
    );

    return NextResponse.json({
      success: true,
      user_id: userId,
      email: targetUser.email,
      is_admin: newAdminStatus,
      message: newAdminStatus
        ? `${targetUser.email} est maintenant administrateur`
        : `${targetUser.email} n'est plus administrateur`,
    });
  } catch (err: any) {
    console.error("[ADMIN PROMOTE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
