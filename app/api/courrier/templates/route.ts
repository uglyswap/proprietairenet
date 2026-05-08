import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    // Get templates: org-specific + default templates, include category
    const result = await query(
      `SELECT id, name, subject, body, variables, is_default, category, created_at
       FROM mail_templates
       WHERE organization_id = $1 OR is_default = true
       ORDER BY category NULLS LAST, is_default DESC, name ASC`,
      [auth.user.organization_id]
    );

    return NextResponse.json({ templates: result.rows });
  } catch (err: any) {
    console.error("[COURRIER TEMPLATES]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const body = await req.json();
    const { name, subject, content, variables, category } = body;

    if (!name || !content) {
      return NextResponse.json({ error: "Nom et contenu requis" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO mail_templates (organization_id, name, subject, body, variables, created_by, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, subject, body, variables, is_default, category, created_at`,
      [
        auth.user.organization_id,
        name,
        subject || name,
        content,
        variables || [],
        auth.user.id,
        category || null,
      ]
    );

    return NextResponse.json({ template: result.rows[0] });
  } catch (err: any) {
    console.error("[COURRIER TEMPLATES CREATE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
