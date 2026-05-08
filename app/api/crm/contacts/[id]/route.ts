import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const contactId = params.id;
    const body = await req.json();

    // Verify contact belongs to org
    const existing = await query(
      "SELECT id FROM contacts WHERE id = $1 AND organization_id = $2",
      [contactId, auth.user.organization_id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }

    const allowedFields = [
      'civilite', 'first_name', 'last_name', 'company_name',
      'address', 'postal_code', 'city', 'phone', 'email',
      'property_address', 'property_postal_code', 'property_city',
      'status', 'notes', 'next_follow_up', 'tags',
    ];

    const setClauses: string[] = ["updated_at = now()"];
    const values: any[] = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        values.push(body[field] === '' ? null : body[field]);
        setClauses.push(`${field} = $${values.length}`);
      }
    }

    if (body.status === 'contacted' || body.status === 'interested' || body.status === 'negotiation') {
      setClauses.push("last_contacted_at = now()");
    }

    values.push(contactId, auth.user.organization_id);
    const result = await query(
      `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING *`,
      values
    );

    return NextResponse.json({ contact: result.rows[0] });
  } catch (err: any) {
    console.error("[CRM PUT]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const contactId = params.id;

    const result = await query(
      "DELETE FROM contacts WHERE id = $1 AND organization_id = $2 RETURNING id",
      [contactId, auth.user.organization_id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Contact non trouvé" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Contact supprimé" });
  } catch (err: any) {
    console.error("[CRM DELETE]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
