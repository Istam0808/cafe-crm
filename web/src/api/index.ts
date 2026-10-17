import { createHttpApi } from './http';
import { mockApi } from './mock';
import type { Api } from './types';

export { ApiError } from './types';

/** Saved by the Android app's "адрес сервера" screen; overrides the build-time setting. */
const SERVER_KEY = 'xazora-server-url';

function serverUrl(): string {
  try {
    const saved = localStorage.getItem(SERVER_KEY);
    if (saved) return saved;
  } catch {
    // storage unavailable
  }
  return import.meta.env.VITE_API_URL ?? '';
}

export const API_URL = serverUrl();

/** Without a backend address the app runs on the in-browser demo backend. */
export const isDemo = API_URL === '';

export const api: Api = isDemo ? mockApi : createHttpApi(API_URL);

export function saveServerUrl(url: string) {
  try {
    if (url) localStorage.setItem(SERVER_KEY, url);
    else localStorage.removeItem(SERVER_KEY);
  } catch {
    // ignore
  }
}
