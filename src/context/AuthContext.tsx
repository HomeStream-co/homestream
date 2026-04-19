/**
 * AuthContext
 *
 * Manages the admin password gate.  On mount it calls GET /api/auth/check.
 * If the server has an adminPassword set and the session cookie is missing/
 * expired, `authenticated` is false and the app renders the LoginGate.
 *
 * Once the user logs in (POST /api/auth/login) the cookie is set server-side
 * and `authenticated` flips to true.
 */
import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react';

interface AuthState {
  /** null = still checking, true = logged in, false = needs login */
  authenticated: boolean | null;
  requiresPassword: boolean;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);

  // Check session on mount
  useEffect(() => {
    fetch('/api/auth/check')
      .then(r => r.json())
      .then((data: { authenticated: boolean; requiresPassword: boolean }) => {
        setAuthenticated(data.authenticated);
        setRequiresPassword(data.requiresPassword);
      })
      .catch(() => {
        // If check fails (no password configured / server error) allow access
        setAuthenticated(true);
        setRequiresPassword(false);
      });
  }, []);

  const login = useCallback(async (password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setAuthenticated(true);
        return { ok: true };
      }
      return { ok: false, error: data.error ?? 'Login failed' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, requiresPassword, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
