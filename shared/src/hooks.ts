import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { toastError } from './components/Toast';
import { useRealtime } from './realtime';
import type { Floor, Menu, Order } from './types';

/** Loads data with fn and exposes reload(); errors go to a toast. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  // ignore responses that arrive after a newer request was made
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (mine === seq.current) setData(result);
    } catch (err) {
      if (mine === seq.current) toastError(err);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, setData, loading, reload };
}

export function useFloor() {
  const state = useLoad<Floor>(() => api.floor(), []);
  useRealtime((e) => {
    if (e.type === 'floor') void state.reload();
  });
  return state;
}

export function useMenu() {
  return useLoad<Menu>(() => api.menu(), []);
}

export function useOrder(orderId: number | null) {
  const state = useLoad<Order | null>(() => (orderId ? api.order(orderId) : Promise.resolve(null)), [orderId]);
  useRealtime((e) => {
    if (e.type === 'order' && e.order_id === orderId) void state.reload();
  });
  return state;
}
