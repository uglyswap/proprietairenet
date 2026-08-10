import { NextRequest, NextResponse } from 'next/server';
import { CADASTRE_API_URL, CADASTRE_API_KEY } from "@/lib/cadastre-api";

export const dynamic = 'force-dynamic';


export async function GET(req: NextRequest) {
  try {
    const backendResponse = await fetch(`${CADASTRE_API_URL}/departments`, {
      headers: { 'X-API-Key': CADASTRE_API_KEY },
    });

    if (!backendResponse.ok) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[DEPARTMENTS] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
