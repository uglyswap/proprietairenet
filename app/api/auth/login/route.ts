import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    const rateCheck = checkRateLimit(ip, 'login');
    if (!rateCheck.allowed) {
      logger.warn('AUTH', `Rate limit exceeded for login`, { ip, retryAfter: rateCheck.retryAfter });
      return NextResponse.json(
        { error: 'Trop de tentatives de connexion. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const session = await loginUser(email, password);

    // Audit: log login
    try {
      const { query: dbQuery } = require('@/lib/db');
      dbQuery('INSERT INTO audit_log (organization_id, user_id, user_email, action, ip_address) VALUES ($1, $2, $3, $4, $5)',
        [session.user.organization_id, session.user.id, session.user.email, 'auth.login', req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown']
      ).catch(() => {});
    } catch {}

    const response = NextResponse.json({
      success: true,
      user: session.user,
      token: session.token,
      expires_at: session.expires_at,
    });

    response.cookies.set('auth-token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error: any) {
    logger.error('AUTH', 'Login error', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Erreur de connexion' },
      { status: 401 }
    );
  }
}
