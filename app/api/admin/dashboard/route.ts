import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

async function safeQuery(sql: string, params: any[] = []): Promise<any> {
  try {
    return await query(sql, params);
  } catch (e: any) {
    if (e.message?.includes("does not exist") || e.message?.includes("relation") || e.code === "42P01" || e.code === "42703") {
      return { rows: [] };
    }
    throw e;
  }
}

async function safeScalar(sql: string, params: any[] = [], fallback: number = 0): Promise<number> {
  try {
    const r = await query(sql, params);
    const val = r.rows[0]?.total ?? r.rows[0]?.count ?? null;
    return val !== null ? parseFloat(val) : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const mrrR = await safeQuery(`SELECT COALESCE(sum(p.price), 0) as current_mrr FROM organizations o LEFT JOIN plans p ON p.slug = o.subscription_plan WHERE o.subscription_plan != 'free' AND p.price IS NOT NULL AND p.price > 0`);
    const currentMrr = parseFloat(mrrR.rows[0]?.current_mrr || 0);
    const churnR = await safeQuery(`SELECT count(*) as churned FROM organizations o WHERE o.subscription_plan = 'free' AND o.subscription_expires_at IS NOT NULL AND o.subscription_expires_at BETWEEN $1 AND $2`, [thisMonth.toISOString(), now.toISOString()]);
    const churned = parseInt(churnR.rows[0]?.churned || 0);
    const paidOrgsR = await safeQuery(`SELECT count(*) as count FROM organizations o JOIN plans p ON p.slug = o.subscription_plan WHERE p.price IS NOT NULL AND p.price > 0`);
    const paidStart = parseInt(paidOrgsR.rows[0]?.count || 0);
    const lifetimeRev = await safeScalar(`SELECT COALESCE(sum(amount), 0) as total FROM credit_transactions WHERE type = 'purchase'`);
    const churnRate = paidStart > 0 ? (churned / paidStart) * 100 : 0;
    const arpa = paidStart > 0 ? currentMrr / paidStart : 0;
    const ltv = churnRate > 0 ? Math.min(arpa / (churnRate / 100), 999999) : 999999;

    const [totalUsersR, totalOrgsR, activeUsersR, inactiveOrgsR] = await Promise.all([
      safeQuery("SELECT count(*) as total FROM users"),
      safeQuery("SELECT count(*) as total FROM organizations"),
      safeQuery(`SELECT count(DISTINCT sh.user_id) as active_users FROM search_history sh WHERE sh.created_at >= $1`, [sevenDaysAgo.toISOString()]),
      safeQuery(`SELECT count(*) as inactive_orgs FROM organizations o WHERE NOT EXISTS (SELECT 1 FROM search_history sh WHERE sh.organization_id = o.id AND sh.created_at >= $1)`, [thirtyDaysAgo.toISOString()])
    ]);
    const totalUsers = parseInt(totalUsersR.rows[0]?.total || 0);
    const totalOrgs = parseInt(totalOrgsR.rows[0]?.total || 0);
    const activeUsers = parseInt(activeUsersR.rows[0]?.active_users || 0);
    const inactiveOrgs = parseInt(inactiveOrgsR.rows[0]?.inactive_orgs || 0);
    const activeRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;
    const newUsersMonth = await safeScalar("SELECT count(*) as total FROM users WHERE created_at >= $1", [thisMonth.toISOString()]);
    const newOrgsMonth = await safeScalar("SELECT count(*) as total FROM organizations WHERE created_at >= $1", [thisMonth.toISOString()]);
    const newUsersWeek = await safeScalar("SELECT count(*) as total FROM users WHERE created_at >= $1", [thisWeek.toISOString()]);
    const newOrgsWeek = await safeScalar("SELECT count(*) as total FROM organizations WHERE created_at >= $1", [thisWeek.toISOString()]);
    const avgUsersR = await safeQuery("SELECT avg(user_count) as avg_users FROM (SELECT count(*) as user_count FROM users GROUP BY organization_id) t");
    const avgUsersPerOrg = parseFloat(avgUsersR.rows[0]?.avg_users || 0);

    const totalMails = await safeScalar("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit')");
    const mailsMonth = await safeScalar("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [thisMonth.toISOString()]);
    const mailsWeek = await safeScalar("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [thisWeek.toISOString()]);
    const mailsToday = await safeScalar("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [oneDayAgo.toISOString()]);
    const mailTypesR = await safeQuery("SELECT type_affranchissement, count(*) as count FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') GROUP BY type_affranchissement");
    const mailRevenueR = await safeQuery("SELECT COALESCE(sum(prix), 0) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit')");
    const creditsRemainingR = await safeQuery("SELECT COALESCE(sum(credits_balance), 0) as total_credits FROM organizations");
    const creditsPurchasedR = await safeQuery("SELECT COALESCE(sum(amount), 0) as purchased FROM credit_transactions WHERE type = 'purchase'");
    const creditsUsedR = await safeQuery("SELECT COALESCE(sum(ABS(amount)), 0) as used FROM credit_transactions WHERE type = 'usage'");
    const searchesByTypeR = await safeQuery("SELECT search_type, count(*) as count FROM search_history GROUP BY search_type");
    const creditsRemaining = parseInt(creditsRemainingR.rows[0]?.total_credits || 0);
    const creditsPurchased = parseInt(creditsPurchasedR.rows[0]?.purchased || 0);
    const creditsUsed = parseInt(creditsUsedR.rows[0]?.used || 0);
    const mailRevenue = parseFloat(mailRevenueR.rows[0]?.total || 0);
    const creditUtilizationRate = creditsPurchased > 0 ? (creditsUsed / creditsPurchased) * 100 : 0;

    const sessions24h = await safeScalar("SELECT count(*) as total FROM sessions WHERE created_at >= $1", [oneDayAgo.toISOString()]);
    const contactsMonth = await safeScalar("SELECT count(*) as total FROM contacts WHERE created_at >= $1", [thisMonth.toISOString()]);
    const activeCampaignsR = await safeQuery("SELECT count(*) as total FROM campaigns WHERE status = 'active'");
    const dripByStepR = await safeQuery("SELECT step, count(*) as count FROM drip_email_queue GROUP BY step");
    const dripCompletedR = await safeQuery("SELECT count(*) as completed FROM drip_email_queue WHERE step = 6 AND status = 'sent'");
    const activeCampaigns = parseInt(activeCampaignsR.rows[0]?.total || 0);
    const dripCompleted = parseInt(dripCompletedR.rows[0]?.completed || 0);

    const funnelR = await safeQuery(`SELECT count(*) as total_signups, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM search_history sh WHERE sh.user_id = u.id)) as users_with_search, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM organizations o WHERE o.id = u.organization_id AND o.subscription_plan != 'free')) as users_paid FROM users u`);
    const totalSignups = parseInt(funnelR.rows[0]?.total_signups || 0);
    const usersWithSearch = parseInt(funnelR.rows[0]?.users_with_search || 0);
    const usersPaid = parseInt(funnelR.rows[0]?.users_paid || 0);
    const usersWithMailR = await safeQuery(`SELECT count(DISTINCT u.id) as users_with_mail FROM users u WHERE EXISTS (SELECT 1 FROM mail_history mh WHERE mh.user_id = u.id)`);
    const usersWithMail = parseInt(usersWithMailR.rows[0]?.users_with_mail || 0);
    const signupToSearchRate = totalSignups > 0 ? (usersWithSearch / totalSignups) * 100 : 0;
    const searchToMailRate = usersWithSearch > 0 ? (usersWithMail / usersWithSearch) * 100 : 0;
    const freeToPaidRate = totalSignups > 0 ? (usersPaid / totalSignups) * 100 : 0;

    const activeCodesR = await safeQuery("SELECT count(*) as active_codes FROM promo_codes WHERE expires_at > NOW()");
    const activeCodes = parseInt(activeCodesR.rows[0]?.active_codes || 0);

    const searchesTrendR = await safeQuery(`SELECT date_trunc('day', created_at)::date as day, count(*) as searches FROM search_history WHERE created_at >= $1 GROUP BY day ORDER BY day`, [thirtyDaysAgo.toISOString()]);
    const signupsTrendR = await safeQuery(`SELECT date_trunc('day', created_at)::date as day, count(*) as signups FROM users WHERE created_at >= $1 GROUP BY day ORDER BY day`, [thirtyDaysAgo.toISOString()]);
    const revenueTrendR = await safeQuery(`SELECT date_trunc('day', created_at)::date as day, COALESCE(sum(amount), 0) as revenue FROM credit_transactions WHERE type = 'purchase' AND created_at >= $1 GROUP BY day ORDER BY day`, [thirtyDaysAgo.toISOString()]);
    const mailsTrendR = await safeQuery(`SELECT date_trunc('day', created_at)::date as day, count(*) as mails FROM mail_history WHERE created_at >= $1 GROUP BY day ORDER BY day`, [thirtyDaysAgo.toISOString()]);
    const weeklyActiveR = await safeQuery(`SELECT date_trunc('week', created_at)::date as week, count(DISTINCT user_id) as active_users FROM search_history WHERE created_at >= $1 GROUP BY week ORDER BY week`, [new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString()]);

    const topOrgsR = await safeQuery(`SELECT o.id, o.name, o.subscription_plan, o.credits_balance, p.price/100 as individual_mrr, max(sh.created_at) as last_activity, count(DISTINCT u.id) as user_count FROM organizations o LEFT JOIN users u ON u.organization_id = o.id LEFT JOIN search_history sh ON sh.organization_id = o.id LEFT JOIN plans p ON p.slug = o.subscription_plan GROUP BY o.id, o.name, o.subscription_plan, o.credits_balance, p.price ORDER BY individual_mrr DESC NULLS LAST, o.credits_balance DESC LIMIT 10`);
    const recentUsersR = await safeQuery(`SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, o.name as org_name, o.subscription_plan FROM users u LEFT JOIN organizations o ON o.id = u.organization_id ORDER BY u.created_at DESC LIMIT 10`);
    const promoCodesR = await safeQuery(`SELECT code, type, discount_value, max_uses, current_uses, expires_at, (max_uses - current_uses) as remaining FROM promo_codes WHERE expires_at > NOW() ORDER BY expires_at ASC`);

    return NextResponse.json({
      financial: { mrr: Math.round(currentMrr), arr: Math.round(currentMrr * 12), mrr_growth: 0, lifetime_revenue: Math.round(lifetimeRev), arpa: Math.round(arpa * 100) / 100, churn_rate: Math.round(churnRate * 100) / 100, ltv: Math.round(ltv) },
      users_orgs: { total_users: totalUsers, new_users_week: newUsersWeek, new_users_month: newUsersMonth, active_users: activeUsers, active_rate: Math.round(activeRate * 100) / 100, avg_users_per_org: Math.round(avgUsersPerOrg * 100) / 100, total_orgs: totalOrgs, new_orgs_week: newOrgsWeek, new_orgs_month: newOrgsMonth, inactive_orgs: inactiveOrgs },
      usage: { total_mails: totalMails, mails_month: mailsMonth, mails_week: mailsWeek, mails_today: mailsToday, mail_revenue: Math.round(mailRevenue * 100) / 100, mails_by_type: mailTypesR.rows, credits_remaining: creditsRemaining, credits_purchased: creditsPurchased, credits_used: creditsUsed, credit_utilization_rate: Math.round(creditUtilizationRate * 100) / 100, searches_by_type: searchesByTypeR.rows },
      engagement: { sessions_24h: sessions24h, contacts_month: contactsMonth, active_campaigns: activeCampaigns, drip_by_step: dripByStepR.rows, drip_completed: dripCompleted },
      funnel: { signup_to_search_rate: Math.round(signupToSearchRate * 100) / 100, search_to_mail_rate: Math.round(searchToMailRate * 100) / 100, free_to_paid_rate: Math.round(freeToPaidRate * 100) / 100, total_signups: totalSignups, users_with_search: usersWithSearch, users_with_mail: usersWithMail, users_paid: usersPaid },
      promo: { active_codes: activeCodes },
      trends: { daily_searches: searchesTrendR.rows, daily_signups: signupsTrendR.rows, daily_revenue: revenueTrendR.rows, daily_mails: mailsTrendR.rows, weekly_active_users: weeklyActiveR.rows },
      tables: { top_organizations: topOrgsR.rows, recent_signups: recentUsersR.rows, active_promo_codes: promoCodesR.rows }
    });
  } catch (err: any) {
    console.error("[ADMIN DASHBOARD] Fatal error:", err);
    return erreurServeur('admin/dashboard', err);
  }
}
