import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const orgId = auth.user.organization_id;
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    // ── Searches ──
    const searchesTotal = await query(
      "SELECT COUNT(*) FROM search_history WHERE organization_id = $1",
      [orgId]
    );
    const searchesMonth = await query(
      "SELECT COUNT(*) FROM search_history WHERE organization_id = $1 AND created_at >= $2",
      [orgId, firstOfMonth]
    );
    const searchesLastMonth = await query(
      "SELECT COUNT(*) FROM search_history WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3",
      [orgId, firstOfLastMonth, firstOfMonth]
    );

    // ── Courriers ──
    const courriersTotal = await query(
      "SELECT COUNT(*) FROM mail_history WHERE organization_id = $1 AND status != 'preview'",
      [orgId]
    );
    const courriersMonth = await query(
      "SELECT COUNT(*) FROM mail_history WHERE organization_id = $1 AND status != 'preview' AND created_at >= $2",
      [orgId, firstOfMonth]
    );
    const courriersByType = await query(
      "SELECT type_affranchissement, COUNT(*) as count FROM mail_history WHERE organization_id = $1 AND status != 'preview' GROUP BY type_affranchissement",
      [orgId]
    );

    // ── Credits ──
    const org = await query(
      "SELECT credits_balance, credits_used FROM organizations WHERE id = $1",
      [orgId]
    );
    const creditsMonth = await query(
      "SELECT COALESCE(SUM(ABS(amount)), 0) as total FROM credit_transactions WHERE organization_id = $1 AND type = 'usage' AND created_at >= $2",
      [orgId, firstOfMonth]
    );

    // ── Contacts CRM ──
    const contactsTotal = await query(
      "SELECT COUNT(*) FROM contacts WHERE organization_id = $1",
      [orgId]
    );
    const contactsByStatus = await query(
      "SELECT status, COUNT(*) as count FROM contacts WHERE organization_id = $1 GROUP BY status ORDER BY count DESC",
      [orgId]
    );
    const contactsWon = await query(
      "SELECT COUNT(*) FROM contacts WHERE organization_id = $1 AND status = 'won'",
      [orgId]
    );

    // ── Top zones (codes postaux) ──
    const topZones = await query(
      `SELECT 
        COALESCE(query_data->>'code_postal', query_data->>'departement', 'N/A') as zone,
        COUNT(*) as count
      FROM search_history 
      WHERE organization_id = $1 AND query_data IS NOT NULL
      GROUP BY zone
      ORDER BY count DESC
      LIMIT 5`,
      [orgId]
    );

    // ── Courriers par mois (6 derniers mois) ──
    const courriersByMonth = await query(
      `SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        TO_CHAR(created_at, 'Mon YYYY') as label,
        COUNT(*) as count
      FROM mail_history 
      WHERE organization_id = $1 AND status != 'preview' AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY month, label
      ORDER BY month ASC`,
      [orgId]
    );

    // Fill in missing months
    const months: { month: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toISOString().substring(0, 7);
      const monthLabel = d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      const found = courriersByMonth.rows.find((r: any) => r.month === monthKey);
      months.push({
        month: monthKey,
        label: monthLabel,
        count: found ? parseInt(found.count) : 0,
      });
    }

    const totalContactsNum = parseInt(contactsTotal.rows[0].count);
    const wonContactsNum = parseInt(contactsWon.rows[0].count);

    return NextResponse.json({
      searches: {
        total: parseInt(searchesTotal.rows[0].count),
        this_month: parseInt(searchesMonth.rows[0].count),
        last_month: parseInt(searchesLastMonth.rows[0].count),
      },
      courriers: {
        total: parseInt(courriersTotal.rows[0].count),
        this_month: parseInt(courriersMonth.rows[0].count),
        by_type: courriersByType.rows.reduce((acc: any, r: any) => {
          acc[r.type_affranchissement] = parseInt(r.count);
          return acc;
        }, {}),
        by_month: months,
      },
      credits: {
        balance: org.rows[0]?.credits_balance || 0,
        total_used: org.rows[0]?.credits_used || 0,
        this_month: parseInt(creditsMonth.rows[0].total),
      },
      contacts: {
        total: totalContactsNum,
        by_status: contactsByStatus.rows.map((r: any) => ({
          status: r.status,
          count: parseInt(r.count),
        })),
        conversion_rate: totalContactsNum > 0 ? Math.round((wonContactsNum / totalContactsNum) * 100) : 0,
      },
      top_zones: topZones.rows.map((r: any) => ({
        zone: r.zone,
        count: parseInt(r.count),
      })),
    });
  } catch (err: any) {
    console.error("[ANALYTICS]", err);
    return NextResponse.json({ error: err.message || "Erreur serveur" }, { status: 500 });
  }
}
