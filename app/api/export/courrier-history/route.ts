import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const result = await query(
      `SELECT 
        mh.created_at, mh.destinataire, mh.recipient_name,
        mh.type_affranchissement, mh.status, mh.prix, mh.credits_used
      FROM mail_history mh
      WHERE mh.organization_id = $1
      ORDER BY mh.created_at DESC`,
      [auth.user.organization_id]
    );

    const BOM = '\uFEFF';
    const headers = 'Date,Destinataire,Société,Adresse,Type,Statut,Prix,Crédits';
    const rows = result.rows.map((row: any) => {
      const dest = row.destinataire || {};
      const name = dest.nom_societe
        ? `${dest.prenom || ''} ${dest.nom || ''}`.trim()
        : row.recipient_name || '';
      const societe = dest.nom_societe || '';
      const adresse = dest.adresse_ligne1
        ? `${dest.adresse_ligne1}, ${dest.code_postal || ''} ${dest.ville || ''}`
        : '';
      return [
        new Date(row.created_at).toLocaleDateString('fr-FR'),
        `"${name.replace(/"/g, '""')}"`,
        `"${societe.replace(/"/g, '""')}"`,
        `"${adresse.replace(/"/g, '""')}"`,
        row.type_affranchissement || '',
        row.status || '',
        row.prix || '0',
        row.credits_used || '0',
      ].join(',');
    }).join('\n');

    const csv = BOM + headers + '\n' + rows;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="courrier-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[EXPORT COURRIER]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
