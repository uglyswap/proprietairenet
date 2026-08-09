import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { erreurServeur } from '@/lib/api-error';

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(req);
    if (!auth) return NextResponse.json({ error }, { status: status || 401 });
    if (!auth.user.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    // Fetch models from OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch models from OpenRouter" }, { status: 502 });
    }

    const data = await response.json();
    
    // Extract and sort models alphabetically
    const models = (data.data || [])
      .map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length,
        pricing: {
          prompt: m.pricing?.prompt,
          completion: m.pricing?.completion,
        },
      }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id));

    return NextResponse.json({ models, count: models.length });
  } catch (err: any) {
    console.error("[AI MODELS]", err);
    return erreurServeur('admin/ai-models', err);
  }
}
