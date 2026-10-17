import type { User } from '../types';

const TOKEN_KEY = 'xazora-token';
const USER_KEY = 'xazora-user';

// The session is kept per tab (sessionStorage) so a waiter tab and a cashier tab in one browser
// don't overwrite each other, and also in localStorage so a phone stays logged in after a restart.
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storages(): Storage[] {
  const list: Storage[] = [];
  // either may throw when storage is blocked
  try { list.push(sessionStorage); } catch { /* blocked */ }
  try { list.push(localStorage); } catch { /* blocked */ }
  return list;
}

function write(key: string, value: string | null) {
  for (const storage of storages()) {
    try {
      if (value) storage.setItem(key, value);
      else storage.removeItem(key);
    } catch {
      // private mode: the session simply won't survive a reload
    }
  }
}

export function getToken(): string | null {
  return read(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  try {
    const raw = read(USER_KEY);
    return raw && getToken() ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string | null, user: User | null) {
  write(TOKEN_KEY, token);
  write(USER_KEY, user ? JSON.stringify(user) : null);
}
