import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    const rateCheck = checkRateLimit(ip, 'forgot-password');
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
      );
    }

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    // Find user
    const result = await query(
      'SELECT id, email, first_name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Always return success (don't leak user existence)
    if (result.rows.length === 0) {
      return NextResponse.json({ success: true, message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.' });
    }

    const user = result.rows[0];

    // Generate reset token (clair envoye par email, jamais stocke)
    const resetToken = crypto.randomBytes(32).toString('hex');
    // On stocke uniquement le hash SHA-256 du token: si la base fuite, le token
    // clair n'est pas exploitable. Le reset hashera le token recu avant lookup.
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store hash (usage unique: efface au reset reussi)
    await query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
      [resetTokenHash, expires, user.id]
    );

    // Send email avec le token clair
    await sendPasswordResetEmail(user.email, resetToken, user.first_name);

    return NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
    });
  } catch (error: any) {
    console.error('[FORGOT-PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
