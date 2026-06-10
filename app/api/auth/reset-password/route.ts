import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function isPasswordValid(password: string): boolean {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token et mot de passe requis' }, { status: 400 });
    }

    if (!isPasswordValid(password)) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre' },
        { status: 400 }
      );
    }

    // Le token est stocke hashe en base (cf. forgot-password): on hashe le token
    // recu avec le meme algorithme avant le lookup pour rester coherent.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token (hash + expiration non depassee)
    const result = await query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW()',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Lien expiré ou invalide. Demandez un nouveau lien.' }, { status: 400 });
    }

    const userId = result.rows[0].id;
    const passwordHash = await hashPassword(password);

    // Update password and clear token (usage unique: token efface)
    await query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [passwordHash, userId]
    );

    // TODO(securite): invalider les sessions JWT existantes apres reset.
    // Actuellement impossible sans changement de schema: le JWT signe dans
    // lib/auth.ts (generateToken) ne porte pas de champ de version (jti/token_version)
    // et la table users ne possede pas de colonne token_version. Les tokens
    // emis avant le reset restent donc valides jusqu'a leur expiration (7j).
    // Pour corriger: ajouter une colonne users.token_version (migration), l'inclure
    // dans le payload JWT, l'incrementer ici, et la verifier dans getUserFromToken.

    return NextResponse.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès. Vous pouvez vous connecter.',
    });
  } catch (error: any) {
    console.error('[RESET-PASSWORD] Error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
