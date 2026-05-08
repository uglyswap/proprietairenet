import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // === FINANCIAL KPIs ===
    const mrrQuery = `
      SELECT COALESCE(sum(p.price_ht), 0) as current_mrr
      FROM organizations o 
      JOIN plans p ON p.slug = o.subscription_plan 
      WHERE o.subscription_plan != 'free' AND p.price_ht > 0
    `;
    
    const previousMrrQuery = `
      SELECT COALESCE(sum(p.price_ht), 0) as previous_mrr
      FROM organizations o 
      JOIN plans p ON p.slug = o.subscription_plan 
      WHERE o.subscription_plan != 'free' AND p.price_ht > 0
      AND o.subscription_started_at < $1
    `;

    const lifetimeRevenueQuery = `
      SELECT COALESCE(sum(amount), 0) as lifetime_revenue
      FROM credit_transactions 
      WHERE type = 'purchase'
    `;

    const churnQuery = `
      WITH paid_orgs_start_month AS (
        SELECT count(*) as count
        FROM organizations o
        JOIN plans p ON p.slug = o.subscription_plan
        WHERE o.subscription_started_at < $1
        AND p.price_ht > 0
      ),
      churned_orgs AS (
        SELECT count(*) as count
        FROM organizations o
        WHERE o.subscription_plan = 'free'
        AND o.subscription_expires_at BETWEEN $1 AND $2
      )
      SELECT 
        COALESCE(paid_orgs_start_month.count, 0) as paid_start,
        COALESCE(churned_orgs.count, 0) as churned
      FROM paid_orgs_start_month, churned_orgs
    `;

    const [
      mrrR,
      previousMrrR,
      lifetimeRevenueR,
      churnR
    ] = await Promise.all([
      query(mrrQuery),
      query(previousMrrQuery, [thisMonth.toISOString()]),
      query(lifetimeRevenueQuery),
      query(churnQuery, [thisMonth.toISOString(), now.toISOString()])
    ]);

    const currentMrr = parseFloat(mrrR.rows[0].current_mrr) / 100;
    const previousMrr = parseFloat(previousMrrR.rows[0].previous_mrr) / 100;
    const lifetimeRevenue = parseFloat(lifetimeRevenueR.rows[0].lifetime_revenue);
    const paidStart = parseInt(churnR.rows[0].paid_start);
    const churned = parseInt(churnR.rows[0].churned);
    
    const mrrGrowth = previousMrr > 0 ? ((currentMrr - previousMrr) / previousMrr) * 100 : 0;
    const churnRate = paidStart > 0 ? (churned / paidStart) * 100 : 0;
    const arpa = paidStart > 0 ? currentMrr / paidStart : 0;
    const ltv = churnRate > 0 ? Math.min(arpa / (churnRate / 100), 999999) : 999999;

    // === USER/ORG KPIs ===
    const userOrgQueries = await Promise.all([
      query("SELECT count(*) as total FROM users"),
      query("SELECT count(*) as total FROM users WHERE created_at >= $1", [thisWeek.toISOString()]),
      query("SELECT count(*) as total FROM users WHERE created_at >= $1", [thisMonth.toISOString()]),
      query("SELECT count(*) as total FROM organizations"),
      query("SELECT count(*) as total FROM organizations WHERE created_at >= $1", [thisWeek.toISOString()]),
      query("SELECT count(*) as total FROM organizations WHERE created_at >= $1", [thisMonth.toISOString()]),
      query(`
        SELECT count(DISTINCT u.id) as active_users
        FROM users u 
        JOIN search_history sh ON sh.user_id = u.id
        WHERE sh.created_at >= $1
      `, [sevenDaysAgo.toISOString()]),
      query("SELECT avg(user_count) as avg_users FROM (SELECT count(*) as user_count FROM users GROUP BY organization_id) t"),
      query(`
        SELECT count(*) as inactive_orgs
        FROM organizations o
        WHERE NOT EXISTS (
          SELECT 1 FROM search_history sh 
          WHERE sh.organization_id = o.id 
          AND sh.created_at >= $1
        )
      `, [thirtyDaysAgo.toISOString()])
    ]);

    const totalUsers = parseInt(userOrgQueries[0].rows[0].total);
    const newUsersWeek = parseInt(userOrgQueries[1].rows[0].total);
    const newUsersMonth = parseInt(userOrgQueries[2].rows[0].total);
    const totalOrgs = parseInt(userOrgQueries[3].rows[0].total);
    const newOrgsWeek = parseInt(userOrgQueries[4].rows[0].total);
    const newOrgsMonth = parseInt(userOrgQueries[5].rows[0].total);
    const activeUsers = parseInt(userOrgQueries[6].rows[0].active_users);
    const avgUsersPerOrg = parseFloat(userOrgQueries[7].rows[0].avg_users || 0);
    const inactiveOrgs = parseInt(userOrgQueries[8].rows[0].inactive_orgs);
    const activeRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0;

    // === USAGE KPIs ===
    const usageQueries = await Promise.all([
      query("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit')"),
      query("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [thisMonth.toISOString()]),
      query("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [thisWeek.toISOString()]),
      query("SELECT count(*) as total FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') AND created_at >= $1", [oneDayAgo.toISOString()]),
      query("SELECT type_affranchissement, count(*) as count FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit') GROUP BY type_affranchissement"),
      query("SELECT COALESCE(sum(prix), 0) as total_mail_revenue FROM mail_history WHERE status IN ('sent', 'delivered', 'in_transit')"),
      query("SELECT COALESCE(sum(credits_balance), 0) as total_credits_remaining FROM organizations"),
      query("SELECT COALESCE(sum(amount), 0) as credits_purchased FROM credit_transactions WHERE type = 'purchase'"),
      query("SELECT COALESCE(sum(ABS(amount)), 0) as credits_used FROM credit_transactions WHERE type = 'usage'"),
      query("SELECT search_type, count(*) as count FROM search_history GROUP BY search_type")
    ]);

    const totalMails = parseInt(usageQueries[0].rows[0].total);
    const mailsMonth = parseInt(usageQueries[1].rows[0].total);
    const mailsWeek = parseInt(usageQueries[2].rows[0].total);
    const mailsToday = parseInt(usageQueries[3].rows[0].total);
    const mailsByType = usageQueries[4].rows;
    const mailRevenue = parseFloat(usageQueries[5].rows[0].total_mail_revenue);
    const creditsRemaining = parseInt(usageQueries[6].rows[0].total_credits_remaining);
    const creditsPurchased = parseInt(usageQueries[7].rows[0].credits_purchased);
    const creditsUsed = parseInt(usageQueries[8].rows[0].credits_used);
    const searchesByType = usageQueries[9].rows;
    const creditUtilizationRate = creditsPurchased > 0 ? (creditsUsed / creditsPurchased) * 100 : 0;

    // === ENGAGEMENT ===
    const engagementQueries = await Promise.all([
      query("SELECT count(*) as total FROM sessions WHERE created_at >= $1", [oneDayAgo.toISOString()]),
      query("SELECT count(*) as total FROM contacts WHERE created_at >= $1", [thisMonth.toISOString()]),
      query("SELECT count(*) as total FROM campaigns WHERE status = 'active'"),
      query("SELECT step, count(*) as count FROM drip_email_queue GROUP BY step"),
      query(`
        SELECT count(*) as completed 
        FROM (
          SELECT email 
          FROM drip_email_queue 
          WHERE step = 6 
          AND status = 'sent'
        ) t
      `)
    ]);

    const sessions24h = parseInt(engagementQueries[0].rows[0].total);
    const contactsMonth = parseInt(engagementQueries[1].rows[0].total);
    const activeCampaigns = parseInt(engagementQueries[2].rows[0].total);
    const dripByStep = engagementQueries[3].rows;
    const dripCompleted = parseInt(engagementQueries[4].rows[0].completed);

    // === CONVERSION FUNNEL ===
    const funnelQueries = await Promise.all([
      query(`
        SELECT 
          count(*) as total_signups,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM search_history sh WHERE sh.user_id = u.id
          )) as users_with_search,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM mail_history mh WHERE mh.user_id = u.id
          )) as users_with_mail,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM organizations o WHERE o.id = u.organization_id AND o.subscription_plan != 'free'
          )) as users_paid
        FROM users u
      `),
      query(`
        SELECT 
          avg(EXTRACT(EPOCH FROM (sh.created_at - u.created_at))/3600) as avg_hours_to_first_search
        FROM users u
        JOIN search_history sh ON sh.user_id = u.id
        WHERE sh.created_at = (
          SELECT min(sh2.created_at) 
          FROM search_history sh2 
          WHERE sh2.user_id = u.id
        )
      `),
      query(`
        SELECT 
          avg(EXTRACT(EPOCH FROM (mh.created_at - first_search.created_at))/3600) as avg_hours_search_to_mail
        FROM mail_history mh
        JOIN (
          SELECT user_id, min(created_at) as created_at
          FROM search_history
          GROUP BY user_id
        ) first_search ON first_search.user_id = mh.user_id
      `)
    ]);

    const totalSignups = parseInt(funnelQueries[0].rows[0].total_signups);
    const usersWithSearch = parseInt(funnelQueries[0].rows[0].users_with_search);
    const usersWithMail = parseInt(funnelQueries[0].rows[0].users_with_mail);
    const usersPaid = parseInt(funnelQueries[0].rows[0].users_paid);
    const avgHoursToSearch = parseFloat(funnelQueries[1].rows[0]?.avg_hours_to_first_search || 0);
    const avgHoursSearchToMail = parseFloat(funnelQueries[2].rows[0]?.avg_hours_search_to_mail || 0);

    const signupToSearchRate = totalSignups > 0 ? (usersWithSearch / totalSignups) * 100 : 0;
    const searchToMailRate = usersWithSearch > 0 ? (usersWithMail / usersWithSearch) * 100 : 0;
    const freeToPaidRate = totalSignups > 0 ? (usersPaid / totalSignups) * 100 : 0;

    // === PROMO CODES ===
    const promoQueries = await Promise.all([
      query("SELECT count(*) as active_codes FROM promo_codes WHERE expires_at > NOW()"),
      query("SELECT sum(current_uses) as total_uses FROM promo_codes"),
      query("SELECT sum(max_uses - current_uses) as remaining_uses FROM promo_codes WHERE expires_at > NOW()")
    ]);

    const activeCodes = parseInt(promoQueries[0].rows[0].active_codes);
    const totalPromoUses = parseInt(promoQueries[1].rows[0].total_uses || 0);
    const remainingPromoUses = parseInt(promoQueries[2].rows[0].remaining_uses || 0);

    // === TRENDS (Time Series) ===
    const trendQueries = await Promise.all([
      query(`
        SELECT date_trunc('day', created_at)::date as day, count(*) as searches 
        FROM search_history 
        WHERE created_at >= $1 
        GROUP BY day 
        ORDER BY day
      `, [thirtyDaysAgo.toISOString()]),
      query(`
        SELECT date_trunc('day', created_at)::date as day, count(*) as signups 
        FROM users 
        WHERE created_at >= $1 
        GROUP BY day 
        ORDER BY day
      `, [thirtyDaysAgo.toISOString()]),
      query(`
        SELECT date_trunc('day', created_at)::date as day, COALESCE(sum(amount), 0) as revenue 
        FROM credit_transactions 
        WHERE type = 'purchase' AND created_at >= $1 
        GROUP BY day 
        ORDER BY day
      `, [thirtyDaysAgo.toISOString()]),
      query(`
        SELECT date_trunc('day', created_at)::date as day, count(*) as mails 
        FROM mail_history 
        WHERE created_at >= $1 
        GROUP BY day 
        ORDER BY day
      `, [thirtyDaysAgo.toISOString()]),
      query(`
        SELECT 
          date_trunc('month', o.subscription_started_at)::date as month,
          COALESCE(sum(p.price_ht), 0)/100 as mrr
        FROM organizations o
        JOIN plans p ON p.slug = o.subscription_plan
        WHERE o.subscription_started_at >= $1
        AND p.price_ht > 0
        GROUP BY month
        ORDER BY month
      `, [new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString()]),
      query(`
        SELECT 
          date_trunc('week', sh.created_at)::date as week,
          count(DISTINCT sh.user_id) as active_users
        FROM search_history sh
        WHERE sh.created_at >= $1
        GROUP BY week
        ORDER BY week
      `, [new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString()])
    ]);

    // === DETAILED TABLES ===
    const detailQueries = await Promise.all([
      query(`
        SELECT 
          o.id, o.name, o.subscription_plan, o.credits_balance,
          p.price_ht/100 as individual_mrr,
          max(sh.created_at) as last_activity,
          count(u.id) as user_count
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id
        LEFT JOIN search_history sh ON sh.organization_id = o.id
        LEFT JOIN plans p ON p.slug = o.subscription_plan
        GROUP BY o.id, o.name, o.subscription_plan, o.credits_balance, p.price_ht
        ORDER BY individual_mrr DESC NULLS LAST, o.credits_balance DESC
        LIMIT 10
      `),
      query(`
        SELECT 
          u.id, u.email, u.first_name, u.last_name, u.created_at,
          o.name as org_name, o.subscription_plan,
          CASE 
            WHEN EXISTS (SELECT 1 FROM search_history sh WHERE sh.user_id = u.id) THEN 'completed'
            ELSE 'pending'
          END as onboarding_status
        FROM users u
        LEFT JOIN organizations o ON o.id = u.organization_id
        ORDER BY u.created_at DESC
        LIMIT 10
      `),
      query(`
        SELECT 
          code, type, discount_value, max_uses, current_uses, expires_at,
          (max_uses - current_uses) as remaining
        FROM promo_codes
        WHERE expires_at > NOW()
        ORDER BY expires_at ASC
      `)
    ]);

    return NextResponse.json({
      // Financial KPIs
      financial: {
        mrr: Math.round(currentMrr),
        arr: Math.round(currentMrr * 12),
        mrr_growth: Math.round(mrrGrowth * 100) / 100,
        lifetime_revenue: Math.round(lifetimeRevenue),
        arpa: Math.round(arpa * 100) / 100,
        churn_rate: Math.round(churnRate * 100) / 100,
        ltv: Math.round(ltv),
      },

      // User/Org KPIs
      users_orgs: {
        total_users: totalUsers,
        new_users_week: newUsersWeek,
        new_users_month: newUsersMonth,
        active_users: activeUsers,
        active_rate: Math.round(activeRate * 100) / 100,
        avg_users_per_org: Math.round(avgUsersPerOrg * 100) / 100,
        total_orgs: totalOrgs,
        new_orgs_week: newOrgsWeek,
        new_orgs_month: newOrgsMonth,
        inactive_orgs: inactiveOrgs,
      },

      // Usage KPIs
      usage: {
        total_mails: totalMails,
        mails_month: mailsMonth,
        mails_week: mailsWeek,
        mails_today: mailsToday,
        mail_revenue: Math.round(mailRevenue * 100) / 100,
        mails_by_type: mailsByType,
        credits_remaining: creditsRemaining,
        credits_purchased: creditsPurchased,
        credits_used: creditsUsed,
        credit_utilization_rate: Math.round(creditUtilizationRate * 100) / 100,
        searches_by_type: searchesByType,
      },

      // Engagement
      engagement: {
        sessions_24h: sessions24h,
        contacts_month: contactsMonth,
        active_campaigns: activeCampaigns,
        drip_by_step: dripByStep,
        drip_completed: dripCompleted,
      },

      // Conversion Funnel
      funnel: {
        signup_to_search_rate: Math.round(signupToSearchRate * 100) / 100,
        search_to_mail_rate: Math.round(searchToMailRate * 100) / 100,
        free_to_paid_rate: Math.round(freeToPaidRate * 100) / 100,
        avg_hours_to_search: Math.round(avgHoursToSearch * 100) / 100,
        avg_hours_search_to_mail: Math.round(avgHoursSearchToMail * 100) / 100,
        total_signups: totalSignups,
        users_with_search: usersWithSearch,
        users_with_mail: usersWithMail,
        users_paid: usersPaid,
      },

      // Promo Codes
      promo: {
        active_codes: activeCodes,
        total_uses: totalPromoUses,
        remaining_uses: remainingPromoUses,
      },

      // Trends
      trends: {
        daily_searches: trendQueries[0].rows,
        daily_signups: trendQueries[1].rows,
        daily_revenue: trendQueries[2].rows,
        daily_mails: trendQueries[3].rows,
        monthly_mrr: trendQueries[4].rows,
        weekly_active_users: trendQueries[5].rows,
      },

      // Detailed Tables
      tables: {
        top_organizations: detailQueries[0].rows,
        recent_signups: detailQueries[1].rows,
        active_promo_codes: detailQueries[2].rows,
      }
    });

  } catch (err: any) {
    console.error("[ADMIN DASHBOARD]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
