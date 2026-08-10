import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import logger from "@/lib/logger";
import { erreurServeur } from '@/lib/api-error';
import { requireFeature } from "@/lib/plan-features";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'crm');
    if (refusPlan) return refusPlan;

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20"), 1), 200);
    const offset = (page - 1) * limit;
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search");
    const sortBy = searchParams.get("sort") || "created_at";
    const sortOrder = searchParams.get("order") === "asc" ? "ASC" : "DESC";

    const allowedSorts = ["created_at", "updated_at", "last_name", "company_name", "status", "next_follow_up", "mail_count"];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : "created_at";

    let sql = `SELECT * FROM contacts WHERE organization_id = $1`;
    const params: any[] = [auth.user.organization_id];

    if (statusFilter && statusFilter !== "all") {
      params.push(statusFilter);
      sql += ` AND status = $${params.length}`;
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      sql += ` AND (
        LOWER(first_name) LIKE $${params.length} OR
        LOWER(last_name) LIKE $${params.length} OR
        LOWER(company_name) LIKE $${params.length} OR
        LOWER(city) LIKE $${params.length} OR
        LOWER(email) LIKE $${params.length} OR
        LOWER(property_city) LIKE $${params.length} OR
        LOWER(address) LIKE $${params.length} OR
        LOWER(property_address) LIKE $${params.length}
      )`;
    }

    // Count
    const countResult = await query(
      sql.replace("SELECT *", "SELECT COUNT(*)"),
      params
    );
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    sql += ` ORDER BY ${safeSort} ${sortOrder} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Status counts
    const statusCounts = await query(
      `SELECT status, COUNT(*) as count FROM contacts WHERE organization_id = $1 GROUP BY status`,
      [auth.user.organization_id]
    );

    return NextResponse.json({
      contacts: result.rows,
      total,
      page,
      totalPages,
      limit,
      status_counts: statusCounts.rows.reduce((acc: any, row: any) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {}),
    });
  } catch (err: any) {
    logger.error('CRM', 'GET contacts error', { error: err.message });
    return erreurServeur('crm/contacts', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    // Verrou de plan : cette fonctionnalite est vendue avec l'offre Pro.
    const refusPlan = await requireFeature(auth, 'crm');
    if (refusPlan) return refusPlan;

    const body = await req.json();
    const {
      civilite, first_name, last_name, company_name,
      address, postal_code, city, phone, email,
      property_address, property_postal_code, property_city,
      status: contactStatus, notes, next_follow_up, tags,
    } = body;

    if (!last_name && !company_name) {
      return NextResponse.json({ error: "Nom ou société requis" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO contacts (
        organization_id, user_id, civilite, first_name, last_name, company_name,
        address, postal_code, city, phone, email,
        property_address, property_postal_code, property_city,
        status, notes, next_follow_up, tags
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        auth.user.organization_id, auth.user.id,
        civilite || null, first_name || null, last_name || null, company_name || null,
        address || null, postal_code || null, city || null, phone || null, email || null,
        property_address || null, property_postal_code || null, property_city || null,
        contactStatus || 'new', notes || null, next_follow_up || null, tags || null,
      ]
    );

    logger.info('CRM', 'Contact created', { contactId: result.rows[0].id, orgId: auth.user.organization_id });

    return NextResponse.json({ contact: result.rows[0] }, { status: 201 });
  } catch (err: any) {
    logger.error('CRM', 'POST contact error', { error: err.message });
    return erreurServeur('crm/contacts', err);
  }
}
