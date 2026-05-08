import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import { scheduleDripEmails } from '@/lib/drip';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

function isPasswordValid(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    const rateCheck = checkRateLimit(ip, 'register');
    if (!rateCheck.allowed) {
      logger.warn('AUTH', `Rate limit exceeded for register`, { ip, retryAfter: rateCheck.retryAfter });
      return NextResponse.json(
        { error: 'Trop de tentatives d\'inscription. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
      );
    }

    const body = await req.json();
    const { email, password, first_name, last_name } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 });
    }

    if (!isPasswordValid(password)) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre' },
        { status: 400 }
      );
    }

    const session = await registerUser(email, password, first_name, last_name);

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, first_name).catch((err: any) => {
      logger.error('EMAIL', 'Failed to send welcome email', { email, error: err.message });
    });

    // Schedule drip email sequence for free users (non-blocking)
    scheduleDripEmails(session.user.id, email).catch((err: any) => {
      logger.error('DRIP', 'Failed to schedule drip emails', { email, error: err.message });
    });

    const response = NextResponse.json({
      success: true,
      user: session.user,
      token: session.token,
      expires_at: session.expires_at,
    });

    // Set HTTP-only cookie for auth
    response.cookies.set('auth-token', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    logger.error('AUTH', 'Register error', { error: error.message });
    return NextResponse.json(
      { error: error.message || 'Erreur lors de l\'inscription' },
      { status: error.message?.includes('existe déjà') ? 409 : 500 }
    );
  }
}
