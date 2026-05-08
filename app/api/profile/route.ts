import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, getUserProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cookieToken = req.cookies.get('auth-token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: 'Profil non trouvé' }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        is_admin: profile.is_admin,
        organization_id: profile.organization_id,
        credits_balance: profile.credits_balance || 0,
        credits_used: profile.credits_used || 0,
        subscription_plan: profile.subscription_plan || 'free',
        monthly_searches_used: profile.monthly_searches_used || 0,
        monthly_searches_limit: profile.monthly_searches_limit || 10,
      },
    });
  } catch (error: any) {
    console.error('[PROFILE] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
