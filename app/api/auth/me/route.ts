import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken, getUserProfile } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Try Bearer token first, then cookie
    const authHeader = req.headers.get('authorization');
    const cookieToken = req.cookies.get('auth-token')?.value;
    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401 });
    }

    const profile = await getUserProfile(user.id);

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        is_admin: profile.is_admin,
        organization_id: profile.organization_id,
        created_at: profile.created_at,
      },
      organization: {
        name: profile.org_name,
        subscription_plan: profile.subscription_plan,
        credits_balance: profile.credits_balance,
        credits_used: profile.credits_used,
        monthly_searches_used: profile.monthly_searches_used,
        monthly_searches_limit: profile.monthly_searches_limit,
        max_users: profile.max_users,
        sender_company: profile.sender_company,
      },
    });
  } catch (error: any) {
    console.error('[AUTH/ME] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
