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

    const result = await pool.query(
      "SELECT provider, model, api_key, system_prompt, updated_at FROM ai_settings WHERE id = '00000000-0000-0000-0000-000000000000'"
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json({ provider: 'openrouter', model: 'openai/gpt-4o-mini', api_key: '', system_prompt: '' });
    }

    const settings = result.rows[0];
    // Mask API key for security (show first 10 + last 4 chars)
    const maskedKey = settings.api_key 
      ? settings.api_key.substring(0, 10) + '...' + settings.api_key.substring(settings.api_key.length - 4)
      : '';

    return NextResponse.json({
      provider: settings.provider,
      model: settings.model,
      api_key_masked: maskedKey,
      has_api_key: !!settings.api_key,
      system_prompt: settings.system_prompt,
      updated_at: settings.updated_at,
    });
  } catch (err: any) {
    console.error("[AI SETTINGS GET]", err);
    return erreurServeur('admin/ai-settings', err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json();
    const { provider, model, api_key, system_prompt } = body;

    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (provider !== undefined) { updates.push(`provider = $${idx}`); values.push(provider); idx++; }
    if (model !== undefined) { updates.push(`model = $${idx}`); values.push(model); idx++; }
    if (api_key !== undefined && api_key !== '') { updates.push(`api_key = $${idx}`); values.push(api_key); idx++; }
    if (system_prompt !== undefined) { updates.push(`system_prompt = $${idx}`); values.push(system_prompt); idx++; }
    
    updates.push('updated_at = NOW()');

    if (updates.length <= 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await pool.query(
      `UPDATE ai_settings SET ${updates.join(', ')} WHERE id = '00000000-0000-0000-0000-000000000000'`,
      values
    );

    return NextResponse.json({ success: true, message: "Settings saved" });
  } catch (err: any) {
    console.error("[AI SETTINGS PUT]", err);
    return erreurServeur('admin/ai-settings', err);
  }
}
