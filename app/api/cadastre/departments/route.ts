import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CADASTRE_API_URL = process.env.CADASTRE_API_URL || 'http://84.247.175.132:8765';
const CADASTRE_API_KEY = process.env.CADASTRE_API_KEY || '';

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
