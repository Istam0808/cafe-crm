/** 35000 → "35 000" */
export function money(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Local timestamp "YYYY-MM-DD HH:MM:SS", the format the backend uses. */
export function nowStamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const today = () => nowStamp().slice(0, 10);

export const hhmm = (stamp: string | null | undefined) => (stamp ? stamp.slice(11, 16) : '');

/** "через сколько минут стол открыт" — for the cashier's table tiles. */
export function minutesSince(stamp: string): number {
  const t = new Date(stamp.replace(' ', 'T')).getTime();
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Android WebView on plain http has no crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const ROLE_LABEL = { admin: 'Админ', cashier: 'Кассир', waiter: 'Официант' } as const;

/** Map.groupBy is missing in older Android WebViews. */
export function groupBy<T, K>(list: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
