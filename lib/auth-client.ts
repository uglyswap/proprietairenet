'use client';

// Client-side auth helpers (replaces Supabase auth)

const TOKEN_KEY = 'proprietaire-auth-token';
const USER_KEY = 'proprietaire-auth-user';
const ADMIN_PREVIEW_KEY = 'proprietaire-admin-preview';

export interface ClientUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_admin: boolean;
  organization_id: string | null;
}

export interface ClientOrganization {
  name: string;
  subscription_plan: string;
  credits_balance: number;
  credits_used: number;
  monthly_searches_used: number;
  monthly_searches_limit: number;
  max_users: number;
  // Profil expediteur (renvoye par /api/auth/me), utilise pour pre-remplir l'expediteur des courriers.
  sender_company?: string | null;
}

// Store token
export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

// Get token
export function getToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TOKEN_KEY);
  }
  return null;
}

// Clear auth
export function clearAuth() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ADMIN_PREVIEW_KEY);
  }
}

// Store user
export function setUser(user: ClientUser) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

// Get cached user
export function getCachedUser(): ClientUser | null {
  if (typeof window !== 'undefined') {
    const data = localStorage.getItem(USER_KEY);
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ─── Admin Preview Mode ─────────────────────────────────────────
export function isAdminPreviewMode(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(ADMIN_PREVIEW_KEY) === 'true';
  }
  return false;
}

export function setAdminPreviewMode(enabled: boolean) {
  if (typeof window !== 'undefined') {
    if (enabled) {
      localStorage.setItem(ADMIN_PREVIEW_KEY, 'true');
    } else {
      localStorage.removeItem(ADMIN_PREVIEW_KEY);
    }
    // Dispatch a custom event so components can react
    window.dispatchEvent(new CustomEvent('admin-preview-change', { detail: { enabled } }));
  }
}

// Login
export async function login(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erreur de connexion');
  }

  setToken(data.token);
  setUser(data.user);

  return data;
}

// Register
export async function register(email: string, password: string, firstName?: string, lastName?: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erreur d\'inscription');
  }

  setToken(data.token);
  setUser(data.user);

  return data;
}

// Get current user (from server)
export async function getMe(): Promise<{ user: ClientUser; organization: ClientOrganization } | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuth();
        return null;
      }
      throw new Error('Erreur serveur');
    }

    const data = await response.json();
    setUser(data.user);
    return data;
  } catch {
    return null;
  }
}

// Logout
export async function logout() {
  clearAuth();
  // Also clear the HTTP-only cookie by calling a logout endpoint
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Ignore errors
  }
}

// Get auth headers for API calls
export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}


// React hook for auth state
export function useAuth() {
  const token = getToken();
  const user = getCachedUser();
  return { token, user };
}
