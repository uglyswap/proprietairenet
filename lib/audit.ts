import { query } from './db';
import { ApiAuthResult } from './api-auth';

/**
 * Log an audit event. Non-blocking — errors are swallowed.
 */
export function logAudit(
  auth: ApiAuthResult,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any>,
  ipAddress?: string
): void {
  if (!auth.user.organization_id) return;
  query(
    `INSERT INTO audit_log (organization_id, user_id, user_email, action, target_type, target_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      auth.user.organization_id,
      auth.user.id,
      auth.user.email,
      action,
      targetType || null,
      targetId || null,
      details ? JSON.stringify(details) : null,
      ipAddress || null,
    ]
  ).catch((err) => console.error('[AUDIT] Failed to log:', err));
}

/**
 * Extract IP address from request headers.
 */
export function getIpFromRequest(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}
