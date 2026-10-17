import { useEffect, useRef } from 'react';
import { API_URL, isDemo } from './api';
import { onMockEvent } from './api/mock';
import { getToken } from './api/token';
import type { RealtimeEvent } from './types';

type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();
let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function connect() {
  const token = getToken();
  if (!token || socket) return;
  const url = new URL('/ws/events/', API_URL || window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);

  const ws = new WebSocket(url);
  socket = ws;
  ws.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as RealtimeEvent;
      listeners.forEach((fn) => fn(event));
    } catch {
      // ignore malformed messages
    }
  };
  ws.onopen = () => {
    // after a reconnect everything may be stale
    listeners.forEach((fn) => fn({ type: 'floor' }));
  };
  ws.onclose = () => {
    socket = null;
    if (listeners.size > 0) retryTimer = setTimeout(connect, 3000);
  };
}

function subscribe(fn: Listener): () => void {
  if (isDemo) return onMockEvent(fn);
  listeners.add(fn);
  connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      clearTimeout(retryTimer);
      socket?.close();
      socket = null;
    }
  };
}

/** Calls handler on every backend event (WebSocket from Django, or the demo backend). */
export function useRealtime(handler: Listener) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), []);
}
