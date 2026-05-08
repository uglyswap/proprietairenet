import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ error: "Service d'enrichissement désactivé. Utilisez le service courrier." }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: "Service d'enrichissement désactivé." }, { status: 410 });
}
