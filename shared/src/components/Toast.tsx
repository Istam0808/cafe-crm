import { useEffect, useState } from 'react';
import { ApiError } from '../api';
import { getToken } from '../api/token';
import { handleAuthError } from '../auth';

type Kind = 'info' | 'success' | 'error';
interface ToastItem { id: number; text: string; kind: Kind }

let push: (text: string, kind: Kind) => void = () => {};
let seq = 0;

export function toast(text: string, kind: Kind = 'info') {
  push(text, kind);
}

/** Shows an API error to the user; the backend's message is already in Russian. */
export function toastError(err: unknown) {
  // requests still in flight when the user logged out — nothing to tell
  if (err instanceof ApiError && err.status === 401 && !getToken()) return;
  handleAuthError(err);
  toast(err instanceof ApiError || err instanceof Error ? err.message : 'Что-то пошло не так', 'error');
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    push = (text, kind) => {
      const id = ++seq;
      setItems((list) => [...list.slice(-3), { id, text, kind }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 2500);
      if (kind === 'error') navigator.vibrate?.(200);
    };
  }, []);

  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
