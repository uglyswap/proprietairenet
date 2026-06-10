import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { checkPermission } from "@/lib/permissions";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Neutralise l'injection de formule CSV (Excel/Sheets) : prefixe ' si la
// valeur commence par un caractere declencheur de formule.
function sanitizeCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    return "'" + s;
  }
  return s;
}

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const denied = await checkPermission(auth, "export");
    if (denied) return denied;

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
      const notes = sanitizeCsvCell(row.notes || '').replace(/\n/g, ' ');
      return [
        `"${sanitizeCsvCell(name).replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(row.company_name || '').replace(/"/g, '""')}"`,
        `"${sanitizeCsvCell(adresse).replace(/"/g, '""')}"`,
        sanitizeCsvCell(statusLabels[row.status] || row.status || ''),
        row.next_follow_up ? new Date(row.next_follow_up).toLocaleDateString('fr-FR') : '',
        `"${notes.replace(/"/g, '""')}"`,
        sanitizeCsvCell(row.mail_count || '0'),
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
