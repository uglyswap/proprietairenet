import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, withTransaction, getColonnes } from './db';
import logger from './logger';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
}

const JWT_EXPIRES_IN = '7d';

export interface AuthUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_admin: boolean;
  organization_id: string | null;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expires_at: string;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Generate JWT token
export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      is_admin: user.is_admin,
      organization_id: user.organization_id,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

// Get user from token
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const result = await query(
    'SELECT id, email, first_name, last_name, role, is_admin, organization_id FROM users WHERE id = $1',
    [payload.sub]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// Register a new user
export async function registerUser(email: string, password: string, firstName?: string, lastName?: string): Promise<AuthSession> {
  const passwordHash = await hashPassword(password);

  // Toutes les ecritures (org, user, owner, credits) dans une seule transaction:
  // soit tout reussit, soit rollback complet (pas d'org/user orphelin).
  const { user, orgId } = await withTransaction(async (client) => {
    // Check if user exists (dans la transaction pour eviter une race d'inscription)
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      throw new Error('Un compte avec cet email existe déjà');
    }

    // Create organization for the user (free plan)
    const orgResult = await client.query(
      `INSERT INTO organizations (name, subscription_plan, max_users, credits_balance, monthly_searches_limit)
       VALUES ($1, 'free', 1, 10, 10) RETURNING id`,
      [`Org de ${firstName || email.split('@')[0]}`]
    );
    const newOrgId = orgResult.rows[0].id;

    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, organization_id, email_verified)
       VALUES ($1, $2, $3, $4, 'user', $5, TRUE) RETURNING id, email, first_name, last_name, role, is_admin, organization_id`,
      [email.toLowerCase(), passwordHash, firstName || null, lastName || null, newOrgId]
    );

    const newUser = userResult.rows[0];

    // Set org owner
    await client.query('UPDATE organizations SET owner_id = $1 WHERE id = $2', [newUser.id, newOrgId]);

    // Log initial credits
    await client.query(
      `INSERT INTO credit_transactions (organization_id, user_id, amount, type, description)
       VALUES ($1, $2, 10, 'bonus', 'Crédits de bienvenue')`,
      [newOrgId, newUser.id]
    );

    return { user: newUser, orgId: newOrgId };
  });

  const token = generateToken(user);

  logger.info('AUTH', `User registered: ${email}`, { userId: user.id, orgId });

  return {
    user,
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

// Login
export async function loginUser(email: string, password: string): Promise<AuthSession> {
  const result = await query(
    'SELECT id, email, password_hash, first_name, last_name, role, is_admin, organization_id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    logger.warn('AUTH', `Login failed: unknown email ${email}`);
    throw new Error('Email ou mot de passe incorrect');
  }

  const user = result.rows[0];
  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    logger.warn('AUTH', `Login failed: wrong password for ${email}`);
    throw new Error('Email ou mot de passe incorrect');
  }

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = generateToken({
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
    is_admin: user.is_admin,
    organization_id: user.organization_id,
  });

  logger.info('AUTH', `User logged in: ${email}`, { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_admin: user.is_admin,
      organization_id: user.organization_id,
    },
    token,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

// Get user profile with organization info
export async function getUserProfile(userId: string) {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_admin, u.organization_id, u.created_at,
            o.name as org_name, o.subscription_plan, o.credits_balance, o.credits_used,
            o.monthly_searches_used, o.monthly_searches_limit, o.max_users, o.sender_company
     FROM users u
     LEFT JOIN organizations o ON u.organization_id = o.id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}

// Check and track search usage
export async function checkSearchLimit(userId: string, orgId: string, isAdmin: boolean = false): Promise<{ allowed: boolean; remaining: number; limit: number; message?: string }> {
  // Admin users always have unlimited searches
  if (isAdmin) {
    return { allowed: true, remaining: 999999, limit: 999999 };
  }

  const org = await query(
    'SELECT subscription_plan, monthly_searches_limit FROM organizations WHERE id = $1',
    [orgId]
  );

  if (org.rows.length === 0) {
    return { allowed: false, remaining: 0, limit: 0, message: 'Organisation non trouvée' };
  }

  const { subscription_plan, monthly_searches_limit } = org.rows[0];

  // Paid plans have unlimited searches
  if (subscription_plan !== 'free') {
    return { allowed: true, remaining: 999999, limit: 999999 };
  }

  // RAZ MENSUELLE PARESSEUSE + increment atomique, en une seule requete.
  //
  // Le quota dit "mensuel" etait en realite un quota A VIE. La fonction
  // reset_monthly_searches() existe bien en base mais n'est appelee par
  // personne : ni pg_cron, ni endpoint, ni aucune occurrence de son nom dans
  // les deux depots. Un compte atteignant sa limite etait donc bloque
  // definitivement, pendant que l'interface lui affichait "ce mois-ci".
  //
  // Plutot que de rebrancher un ordonnanceur qu'on peut oublier a nouveau, la
  // remise a zero est integree au chemin de consommation : elle devient
  // structurellement impossible a oublier, puisqu'elle s'execute a la premiere
  // recherche de chaque nouvelle periode.
  //
  // La colonne monthly_searches_reset_at fait partie des colonnes absentes de
  // la production : sans elle, on conserve le comportement precedent plutot que
  // d'echouer (cf. migrations/005_quota_mensuel.sql).
  const colonnesOrg = await getColonnes('organizations');
  const aColonneReset = colonnesOrg.has('monthly_searches_reset_at');

  const sqlIncrement = aColonneReset
    ? `UPDATE organizations
          SET monthly_searches_used = CASE
                WHEN monthly_searches_reset_at IS NULL
                  OR monthly_searches_reset_at < date_trunc('month', now())
                THEN 1
                ELSE monthly_searches_used + 1 END,
              monthly_searches_reset_at = CASE
                WHEN monthly_searches_reset_at IS NULL
                  OR monthly_searches_reset_at < date_trunc('month', now())
                THEN date_trunc('month', now())
                ELSE monthly_searches_reset_at END
        WHERE id = $1
          AND (
                monthly_searches_reset_at IS NULL
             OR monthly_searches_reset_at < date_trunc('month', now())
             OR monthly_searches_used < monthly_searches_limit
          )
        RETURNING monthly_searches_used, monthly_searches_limit`
    : `UPDATE organizations
          SET monthly_searches_used = monthly_searches_used + 1
        WHERE id = $1 AND monthly_searches_used < monthly_searches_limit
        RETURNING monthly_searches_used, monthly_searches_limit`;

  const updated = await query(sqlIncrement, [orgId]);

  if (updated.rows.length === 0) {
    // Aucune ligne mise a jour: la limite de la periode en cours est atteinte.
    return {
      allowed: false,
      remaining: 0,
      limit: monthly_searches_limit,
      message: `Vous avez atteint votre limite de ${monthly_searches_limit} recherches gratuites ce mois-ci. Passez a l'offre Pro pour des recherches illimitees.`,
    };
  }

  const newUsed = updated.rows[0].monthly_searches_used;
  const newLimit = updated.rows[0].monthly_searches_limit;
  const remaining = newLimit - newUsed;

  return {
    allowed: true,
    remaining,
    limit: newLimit,
    message: remaining <= 2
      ? `Il vous reste ${remaining} recherche${remaining > 1 ? 's' : ''} gratuite${remaining > 1 ? 's' : ''} ce mois-ci. Passez a l'offre Pro pour des recherches illimitees.`
      : undefined,
  };
}
