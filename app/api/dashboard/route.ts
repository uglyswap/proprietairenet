import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';
import { getEffectiveRoleLevel } from '@/lib/permissions';
import logger from '@/lib/logger';
import { erreurServeur } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });

    const userId = auth.user.id;
    const orgId = auth.user.organization_id;

    if (!orgId) {
      return NextResponse.json({ error: 'Aucune organisation' }, { status: 400 });
    }

    const roleLevel = await getEffectiveRoleLevel(userId, orgId);

    const data: any = { role: roleLevel };

    // All roles: basic org info
    const orgResult = await query(
      `SELECT name, subscription_plan, credits_balance, credits_used, 
              monthly_searches_used, monthly_searches_limit, max_users
       FROM organizations WHERE id = $1`,
      [orgId]
    );
    if (orgResult.rows.length > 0) {
      data.organization = orgResult.rows[0];
    }

    if (roleLevel === 'owner' || roleLevel === 'admin') {
      // Owner/Admin: everything
      const [teamCount, totalSearches, totalCourriers, recentActions, creditBalance] = await Promise.all([
        query('SELECT COUNT(*) FROM users WHERE organization_id = $1', [orgId]),
        query(
          `SELECT COUNT(*) as total, 
                  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') as month
           FROM search_history WHERE organization_id = $1`, [orgId]
        ),
        query(
          `SELECT COUNT(*) as total, 
                  COALESCE(SUM(credits_used), 0) as credits_spent
           FROM mail_history WHERE organization_id = $1 AND status IN ('sent', 'delivered', 'in_transit')`, [orgId]
        ),
        query(
          `SELECT action, user_email, created_at 
           FROM audit_log WHERE organization_id = $1 
           ORDER BY created_at DESC LIMIT 10`, [orgId]
        ),
        query(
          `SELECT credits_balance FROM organizations WHERE id = $1`, [orgId]
        ),
      ]);

      data.kpis = {
        team_members: parseInt(teamCount.rows[0].count),
        total_searches: parseInt(totalSearches.rows[0].total),
        monthly_searches: parseInt(totalSearches.rows[0].month),
        total_courriers: parseInt(totalCourriers.rows[0].total),
        credits_spent: parseInt(totalCourriers.rows[0].credits_spent),
        credits_balance: parseInt(creditBalance.rows[0].credits_balance),
      };
      data.recent_actions = recentActions.rows;

    } else if (roleLevel === 'manager') {
      // Manager: team analytics
      const [totalSearches, recentSearches] = await Promise.all([
        query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') as month
           FROM search_history WHERE organization_id = $1`, [orgId]
        ),
        query(
          `SELECT sh.search_type, sh.created_at, u.email 
           FROM search_history sh 
           LEFT JOIN users u ON sh.user_id = u.id
           WHERE sh.organization_id = $1 
           ORDER BY sh.created_at DESC LIMIT 10`, [orgId]
        ),
      ]);

      data.kpis = {
        total_searches: parseInt(totalSearches.rows[0].total),
        monthly_searches: parseInt(totalSearches.rows[0].month),
      };
      data.recent_searches = recentSearches.rows;

    } else if (roleLevel === 'agent') {
      // Agent: own stats only
      const [mySearches, myCourriers, myContacts] = await Promise.all([
        query(
          `SELECT COUNT(*) as total FROM search_history WHERE user_id = $1`, [userId]
        ),
        query(
          `SELECT COUNT(*) as total, COALESCE(SUM(credits_used), 0) as credits_spent 
           FROM mail_history WHERE user_id = $1 AND status IN ('sent', 'delivered', 'in_transit')`, [userId]
        ),
        query(
          `SELECT COUNT(*) as total FROM contacts WHERE user_id = $1`, [userId]
        ),
      ]);

      data.kpis = {
        my_searches: parseInt(mySearches.rows[0].total),
        my_courriers: parseInt(myCourriers.rows[0].total),
        my_credits_spent: parseInt(myCourriers.rows[0].credits_spent),
        my_contacts: parseInt(myContacts.rows[0].total),
      };

    } else {
      // Viewer: limited
      const mySearches = await query(
        `SELECT COUNT(*) as total FROM search_history WHERE user_id = $1`, [userId]
      );
      data.kpis = {
        my_searches: parseInt(mySearches.rows[0].total),
        searches_limit: orgResult.rows[0]?.monthly_searches_limit || 0,
      };
    }

    return NextResponse.json(data);
  } catch (err: any) {
    logger.error('DASHBOARD', 'GET error', { error: err.message });
    return erreurServeur('dashboard', err);
  }
}
