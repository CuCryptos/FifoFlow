import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';

export interface AuthedUser {
  id: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthContextValue {
  user: AuthedUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(): Promise<AuthedUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Failed to fetch current user');
  const body = await res.json();
  return body.user as AuthedUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const onUnauth = () => setUser(null);
    window.addEventListener('fifoflow:unauthenticated', onUnauth);
    return () => window.removeEventListener('fifoflow:unauthenticated', onUnauth);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(body.error ?? 'Login failed');
    }
    const body = await res.json();
    setUser(body.user as AuthedUser);
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
