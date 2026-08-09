import { NextRequest, NextResponse } from 'next/server';
import { loginUser } from '@/lib/auth';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Le corps est lu AVANT le controle de debit pour pouvoir fournir l'adresse
    // email comme discriminant. Sans elle, et quand l'IP n'est pas resoluble,
    // tous les appelants partageaient le meme compteur : cinq echecs bloquaient
    // la connexion de tous les utilisateurs pendant quinze minutes.
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    const ip = getClientIP(req);
    const rateCheck = checkRateLimit(ip, 'login', String(email));
    if (!rateCheck.allowed) {
      logger.warn('AUTH', `Rate limit exceeded for login`, { ip, retryAfter: rateCheck.retryAfter });
      return NextResponse.json(
        { error: 'Trop de tentatives de connexion. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
      );
    }

    const session = await loginUser(email, password);

    // Audit: log login
    try {
      const { query: dbQuery } = require('@/lib/db');
      // getClientIP n'honore x-forwarded-for que derriere un proxy declare de
      // confiance. Lire ce header sans condition, comme ici auparavant, rendait
      // toutes les adresses IP du journal d'audit falsifiables par le client.
      dbQuery('INSERT INTO audit_log (organization_id, user_id, user_email, action, ip_address) VALUES ($1, $2, $3, $4, $5)',
        [session.user.organization_id, session.user.id, session.user.email, 'auth.login', ip]
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
