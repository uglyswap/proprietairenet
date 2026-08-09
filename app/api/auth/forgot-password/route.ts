import { NextRequest, NextResponse } from 'next/server';
import { query, getColonnes } from '@/lib/db';
import { sendPasswordResetEmail } from '@/lib/email';
import { checkRateLimit, getClientIP } from '@/lib/rate-limit';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIP(req);
    // Sans discriminant, un compteur global bloquerait tout le monde quand
    // l'IP n'est pas resoluble : voir lib/rate-limit.
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

    // REPONSE UNIQUE, QUOI QU'IL ARRIVE
    //
    // Le commentaire du code promettait de ne pas divulguer l'existence d'un
    // compte, et le schema faisait exactement l'inverse : pour un email inconnu
    // la fonction retournait 200, et pour un email CONNU l'UPDATE sur les
    // colonnes password_reset_token / password_reset_expires, absentes de la
    // production, levait une erreur remontee en 500. Un attaquant distinguait
    // donc les comptes existants a coup sur, par le seul code de statut.
    //
    // Toute branche renvoie desormais la meme reponse. Les echecs techniques
    // sont journalises cote serveur, jamais exposes.
    const reponseGenerique = NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
    });

    const result = await query(
      'SELECT id, email, first_name FROM users WHERE email = $1',
      [String(email).toLowerCase()]
    );

    if (result.rows.length === 0) {
      return reponseGenerique;
    }

    const user = result.rows[0];

    // La reinitialisation exige deux colonnes qui font partie des colonnes
    // attendues par le code et absentes de la base. Sans elles, on ne peut pas
    // emettre de lien valide : on le signale a l'exploitant, sans le dire au
    // client, dont la reponse reste identique.
    const colonnesUsers = await getColonnes('users');
    const peutStockerJeton =
      colonnesUsers.has('password_reset_token') &&
      colonnesUsers.has('password_reset_expires');

    if (!peutStockerJeton) {
      console.error(
        '[FORGOT-PASSWORD] Colonnes password_reset_token / password_reset_expires ' +
          'absentes : reinitialisation impossible. Appliquer migrations/006_password_reset.sql.'
      );
      return reponseGenerique;
    }

    try {
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
    } catch (err) {
      // Un echec d'envoi ou d'ecriture ne doit pas devenir un signal exploitable.
      console.error('[FORGOT-PASSWORD] Echec de la generation du lien', err);
    }

    return reponseGenerique;
  } catch (error: any) {
    console.error('[FORGOT-PASSWORD] Error:', error);
    // Meme en cas d'erreur inattendue, la reponse reste indistinguable.
    return NextResponse.json({
      success: true,
      message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.',
    });
  }
}
