// Server-side auth helper for API routes
import { NextRequest } from 'next/server';
import { getUserFromToken, checkSearchLimit, AuthUser } from './auth';

export interface ApiAuthResult {
  user: AuthUser;
  searchCheck?: {
    allowed: boolean;
    remaining: number;
    limit: number;
    message?: string;
  };
}

// Authenticate request and optionally check search limit
export async function authenticateRequest(
  req: NextRequest,
  options: { checkSearch?: boolean } = {}
): Promise<{ auth: ApiAuthResult | null; error?: string; status?: number; upgrade_required?: boolean }> {
  const authHeader = req.headers.get('authorization');
  const cookieToken = req.cookies.get('auth-token')?.value;
  const token = authHeader?.replace('Bearer ', '') || cookieToken;

  if (!token) {
    return { auth: null, error: 'Non authentifié', status: 401 };
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return { auth: null, error: 'Token invalide ou expiré', status: 401 };
  }

  const result: ApiAuthResult = { user };

  if (options.checkSearch && user.organization_id) {
    // Pass is_admin flag so admins bypass search limits entirely
    const searchCheck = await checkSearchLimit(user.id, user.organization_id, user.is_admin);
    result.searchCheck = searchCheck;

    if (!searchCheck.allowed) {
      return {
        auth: result,
        error: searchCheck.message || 'Limite de recherches atteinte',
        status: 403,
        upgrade_required: true,
      };
    }
  }

  return { auth: result };
}

// Helper: check if user is admin (for credit bypass in routes)
export function isAdminUser(auth: ApiAuthResult): boolean {
  return auth.user.is_admin === true;
}
