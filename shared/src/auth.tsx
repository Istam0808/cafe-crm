import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { getStoredUser, saveSession } from './api/token';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  /** Roles that may use this app (the waiter app and the cashier app differ). */
  roles: Role[];
  login(pin: string, userId?: number): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

let onUnauthorized: () => void = () => {};

/** Any 401 from the backend ends the session (token revoked, employee disabled). */
export function handleAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) onUnauthorized();
}

export function AuthProvider({ roles, children }: { roles: Role[]; children: ReactNode }) {
  // both apps may be served from one host and share storage: a session of the other app doesn't count here
  const [user, setUser] = useState<User | null>(() => {
    const stored = getStoredUser();
    return stored && roles.includes(stored.role) ? stored : null;
  });

  const clear = useCallback(() => {
    saveSession(null, null);
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized = clear;
  }, [clear]);

  const login = useCallback(async (pin: string, userId?: number) => {
    const res = await api.login(pin, userId);
    if (!roles.includes(res.user.role)) throw new Error('Нет доступа к этому приложению');
    saveSession(res.token, res.user);
    setUser(res.user);
    return res.user;
  }, [roles]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // logging out locally is what matters
    }
    clear();
  }, [clear]);

  return <AuthContext.Provider value={{ user, roles, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export const isManagerRole = (role: Role | undefined) => role === 'admin' || role === 'cashier';
