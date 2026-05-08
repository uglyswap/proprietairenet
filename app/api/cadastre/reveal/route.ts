import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { auth, error, status } = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ success: false, error }, { status: status || 401 });
    }

    const body = await request.json();
    const { result_ids, results_data } = body;

    if (!result_ids || !Array.isArray(result_ids) || result_ids.length === 0) {
      return NextResponse.json({ success: false, error: 'IDs manquants' }, { status: 400 });
    }

    // Search data is already revealed (free). This endpoint is a no-op for now.
    // Real enrichment (FullEnrich) will be a separate endpoint.
    return NextResponse.json({
      success: true,
      revealed_count: result_ids.length,
      credits_used: 0,
      remaining_credits: 0,
      revealed_data: result_ids.map((id: string) => {
        const match = results_data?.find((r: any) => r.id === id);
        return match || { id };
      }),
    });
  } catch (error: any) {
    console.error('[REVEAL] Error:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}
