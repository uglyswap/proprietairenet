import { query, getColonnes } from './db';
import { NextResponse } from 'next/server';
import { ApiAuthResult } from './api-auth';

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  manager: 'Manager',
  agent: 'Agent',
  viewer: 'Lecteur',
};

export const ALL_PERMISSIONS = [
  'search', 'courrier.send', 'courrier.bulk', 'crm.view', 'crm.edit',
  'export', 'analytics', 'team.manage', 'settings.edit', 'billing',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * Get the effective role_level for a user.
 * Falls back to mapping old 'role' column values.
 */
export async function getUserRoleLevel(userId: string): Promise<string> {
  // users.role_level fait partie des colonnes attendues par le code et absentes
  // de la production. La selectionner sans precaution leve un 42703 qui
  // remontait en HTTP 500 pour tout membre non proprietaire de son
  // organisation. On se rabat alors sur la colonne `role`, qui existe.
  const colonnes = await getColonnes('users');
  const aRoleLevel = colonnes.has('role_level');

  const result = await query(
    aRoleLevel
      ? 'SELECT role_level, role FROM users WHERE id = $1'
      : 'SELECT NULL::text AS role_level, role FROM users WHERE id = $1',
    [userId]
  );
  if (result.rows.length === 0) return 'viewer';
  const { role_level, role } = result.rows[0];
  if (role_level && role_level !== 'member') return role_level;
  if (role === 'admin') return 'admin';
  return 'agent'; // default for 'user'/'member'
}

/**
 * Check if a user has a specific permission based on their role_level.
 */
export async function hasPermission(userId: string, orgId: string, permission: string): Promise<boolean> {
  const orgCheck = await query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
  if (orgCheck.rows.length > 0 && orgCheck.rows[0].owner_id === userId) return true;

  const roleLevel = await getUserRoleLevel(userId);

  const result = await query(
    'SELECT 1 FROM role_permissions WHERE role_level = $1 AND permission = $2',
    [roleLevel, permission]
  );
  return result.rows.length > 0;
}

/**
 * Get all permissions for a role level.
 */
export async function getPermissionsForRole(roleLevel: string): Promise<string[]> {
  const result = await query(
    'SELECT permission FROM role_permissions WHERE role_level = $1',
    [roleLevel]
  );
  return result.rows.map((r: any) => r.permission);
}

/**
 * Middleware-style permission check for API routes.
 */
export async function checkPermission(
  auth: ApiAuthResult,
  permission: string
): Promise<NextResponse | null> {
  if (auth.user.is_admin) return null;

  if (!auth.user.organization_id) {
    return NextResponse.json({ error: 'Aucune organisation associée' }, { status: 403 });
  }

  const allowed = await hasPermission(auth.user.id, auth.user.organization_id, permission);
  if (!allowed) {
    return NextResponse.json(
      { error: `Permission refusée : ${permission}` },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Get effective role_level considering org ownership.
 */
export async function getEffectiveRoleLevel(userId: string, orgId: string): Promise<string> {
  const orgCheck = await query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
  if (orgCheck.rows.length > 0 && orgCheck.rows[0].owner_id === userId) return 'owner';
  return getUserRoleLevel(userId);
}
