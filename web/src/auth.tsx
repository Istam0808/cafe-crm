import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { getStoredUser, saveSession } from './api/token';
import type { Role, User } from './types';

interface AuthState {
  user: User | null;
  login(userId: number, pin: string): Promise<User>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

let onUnauthorized: () => void = () => {};

/** Any 401 from the backend ends the session (token revoked, employee disabled). */
export function handleAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401) onUnauthorized();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);

  const clear = useCallback(() => {
    saveSession(null, null);
    setUser(null);
  }, []);

  useEffect(() => {
    onUnauthorized = clear;
  }, [clear]);

  const login = useCallback(async (userId: number, pin: string) => {
    const res = await api.login(userId, pin);
    saveSession(res.token, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // logging out locally is what matters
    }
    clear();
  }, [clear]);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export const isManagerRole = (role: Role | undefined) => role === 'admin' || role === 'cashier';

export const homePath = (role: Role) => (role === 'waiter' ? '/waiter' : '/cashier');
