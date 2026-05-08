import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth || !auth.user.is_admin) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    // Get all stats in parallel
    const [usersResult, orgsResult, searchesResult, recentSearchesResult, planDistResult] = await Promise.all([
      query('SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW() - INTERVAL \'7 days\' THEN 1 END) as recent FROM users'),
      query('SELECT COUNT(*) as total, SUM(credits_balance) as total_credits, SUM(credits_used) as total_used FROM organizations'),
      query('SELECT COUNT(*) as total, SUM(results_count) as total_results FROM search_history'),
      query('SELECT DATE(created_at) as day, COUNT(*) as count FROM search_history WHERE created_at > NOW() - INTERVAL \'30 days\' GROUP BY DATE(created_at) ORDER BY day'),
      query("SELECT subscription_plan, COUNT(*) as count FROM organizations GROUP BY subscription_plan ORDER BY count DESC"),
    ]);

    return NextResponse.json({
      users: {
        total: parseInt(usersResult.rows[0].total),
        recent_7d: parseInt(usersResult.rows[0].recent),
      },
      organizations: {
        total: parseInt(orgsResult.rows[0].total),
        total_credits: parseInt(orgsResult.rows[0].total_credits || '0'),
        total_credits_used: parseInt(orgsResult.rows[0].total_used || '0'),
      },
      searches: {
        total: parseInt(searchesResult.rows[0].total),
        total_results: parseInt(searchesResult.rows[0].total_results || '0'),
      },
      daily_searches: recentSearchesResult.rows.map(r => ({
        day: r.day,
        count: parseInt(r.count),
      })),
      plan_distribution: planDistResult.rows.map(r => ({
        plan: r.subscription_plan,
        count: parseInt(r.count),
      })),
    });
  } catch (error: any) {
    console.error('[ADMIN STATS] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
