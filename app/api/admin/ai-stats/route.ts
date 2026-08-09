import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import pool from "@/lib/db";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    // Get AI settings for the API key
    const settingsResult = await pool.query(
      "SELECT api_key, provider FROM ai_settings WHERE id = '00000000-0000-0000-0000-000000000000'"
    );
    const settings = settingsResult.rows[0];

    // OpenRouter balance
    let openrouterBalance: any = null;
    if (settings?.api_key && settings?.provider === 'openrouter') {
      try {
        const balanceRes = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { 'Authorization': `Bearer ${settings.api_key}` },
        });
        if (balanceRes.ok) {
          const balanceData = await balanceRes.json();
          const d = balanceData.data || {};

          // Also fetch credits balance (separate endpoint)
          let creditsData: any = null;
          try {
            const creditsRes = await fetch('https://openrouter.ai/api/v1/credits', {
              headers: { 'Authorization': `Bearer ${settings.api_key}` },
            });
            if (creditsRes.ok) creditsData = await creditsRes.json();
          } catch {}

          const totalCredits = creditsData?.data?.total_credits || 0;
          const totalUsage = creditsData?.data?.total_usage || 0;
          const remaining = totalCredits > 0 ? totalCredits - totalUsage : null;

          openrouterBalance = {
            has_credits: totalCredits > 0,
            total_credits: totalCredits,
            total_usage: totalUsage,
            remaining: remaining,
            has_limit: d.limit !== null && d.limit !== undefined,
            limit: d.limit,
            usage_monthly: d.usage_monthly || 0,
            usage_daily: d.usage_daily || 0,
            is_free_tier: d.is_free_tier ?? false,
          };
        }
      } catch (e) {
        console.error('[AI STATS] OpenRouter balance error:', e);
      }
    }

    // AI usage stats for current month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_generations,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COALESCE(AVG(cost_usd), 0) as avg_cost_usd,
        COALESCE(AVG(total_tokens), 0) as avg_tokens,
        COALESCE(SUM(prompt_tokens), 0) as total_prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as total_completion_tokens
      FROM ai_usage
      WHERE created_at >= $1
    `, [monthStart.toISOString()]);

    // Per-model breakdown
    const modelBreakdown = await pool.query(`
      SELECT 
        model,
        COUNT(*) as count,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM ai_usage
      WHERE created_at >= $1
      GROUP BY model
      ORDER BY count DESC
    `, [monthStart.toISOString()]);

    // Per-user breakdown
    const userBreakdown = await pool.query(`
      SELECT 
        user_email,
        COUNT(*) as count,
        COALESCE(SUM(cost_usd), 0) as cost_usd
      FROM ai_usage
      WHERE created_at >= $1
      GROUP BY user_email
      ORDER BY count DESC
      LIMIT 10
    `, [monthStart.toISOString()]);

    // Daily usage (last 30 days)
    const dailyUsage = await pool.query(`
      SELECT 
        DATE(created_at) as day,
        COUNT(*) as count,
        COALESCE(SUM(cost_usd), 0) as cost_usd,
        COALESCE(SUM(total_tokens), 0) as tokens
      FROM ai_usage
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    // All-time stats
    const allTimeResult = await pool.query(`
      SELECT 
        COUNT(*) as total_generations,
        COALESCE(SUM(cost_usd), 0) as total_cost_usd,
        COALESCE(SUM(total_tokens), 0) as total_tokens
      FROM ai_usage
    `);

    return NextResponse.json({
      openrouter_balance: openrouterBalance,
      month: {
        ...statsResult.rows[0],
        period: monthStart.toISOString().substring(0, 7),
      },
      all_time: allTimeResult.rows[0],
      by_model: modelBreakdown.rows,
      by_user: userBreakdown.rows,
      daily: dailyUsage.rows,
    });
  } catch (err: any) {
    console.error("[AI STATS]", err);
    return erreurServeur('admin/ai-stats', err);
  }
}
