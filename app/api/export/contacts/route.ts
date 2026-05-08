import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      `SELECT * FROM contacts WHERE organization_id = $1 ORDER BY created_at DESC`,
      [auth.user.organization_id]
    );

    const BOM = '\uFEFF';
    const headers = 'Nom,Société,Adresse,Statut,Dernière relance,Notes,Nb courriers';
    const statusLabels: Record<string, string> = {
      new: 'Nouveau',
      contacted: 'Contacté',
      interested: 'Intéressé',
      negotiation: 'Négociation',
      won: 'Gagné',
      lost: 'Perdu',
    };

    const rows = result.rows.map((row: any) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
      const adresse = [row.property_address, row.property_postal_code, row.property_city].filter(Boolean).join(', ');
      return [
        `"${(name || '').replace(/"/g, '""')}"`,
        `"${(row.company_name || '').replace(/"/g, '""')}"`,
        `"${adresse.replace(/"/g, '""')}"`,
        statusLabels[row.status] || row.status || '',
        row.next_follow_up ? new Date(row.next_follow_up).toLocaleDateString('fr-FR') : '',
        `"${(row.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        row.mail_count || '0',
      ].join(',');
    }).join('\n');

    const csv = BOM + headers + '\n' + rows;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[EXPORT CONTACTS]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
