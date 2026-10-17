import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { money, uuid } from '../format';
import type { NewItem, Product } from '../types';
import { Modal } from './Modal';

export interface CartLine {
  key: string;
  product_id: number;
  name: string;
  price: number;
  qty: number;
  comment: string;
}

interface CartState {
  lines: CartLine[];
  /** Kept between retries of one send so the backend can drop a duplicate (PROJECT.md §3). */
  requestId: string | null;
}

const storageKey = (scope: string) => `xazora-cart-${scope}`;

function loadCart(scope: string): CartState {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (raw) return JSON.parse(raw) as CartState;
  } catch {
    // ignore
  }
  return { lines: [], requestId: null };
}

function saveCart(scope: string, state: CartState) {
  try {
    if (state.lines.length) localStorage.setItem(storageKey(scope), JSON.stringify(state));
    else localStorage.removeItem(storageKey(scope));
  } catch {
    // ignore
  }
}

/** Unsent items of one table; survives closing the app so a waiter never loses a half-taken order. */
export function useCart(scope: string) {
  const [state, setRawState] = useState<CartState>(() => loadCart(scope));
  const current = useRef(state);

  useEffect(() => {
    current.current = loadCart(scope);
    setRawState(current.current);
  }, [scope]);

  // Saved synchronously, not in an effect or a state updater: after "Отправить" the screen
  // unmounts right away, and deferred work would never run, leaving sent items in the stored cart.
  const setState = useCallback(
    (update: (s: CartState) => CartState) => {
      const next = update(current.current);
      current.current = next;
      saveCart(scope, next);
      setRawState(next);
    },
    [scope],
  );

  // any edit makes it a different order, so a new request id is needed
  const edit = useCallback((fn: (lines: CartLine[]) => CartLine[]) => setState((s) => ({ lines: fn(s.lines), requestId: null })), [setState]);

  const add = useCallback(
    (p: Product) =>
      edit((lines) => {
        const same = lines.find((l) => l.product_id === p.id && !l.comment);
        if (same) return lines.map((l) => (l === same ? { ...l, qty: Math.min(l.qty + 1, 99) } : l));
        return [...lines, { key: uuid(), product_id: p.id, name: p.name, price: p.price, qty: 1, comment: '' }];
      }),
    [edit],
  );

  const update = useCallback(
    (key: string, patch: Partial<CartLine>) =>
      edit((lines) => lines.map((l) => (l.key === key ? { ...l, ...patch } : l)).filter((l) => l.qty > 0)),
    [edit],
  );

  const clear = useCallback(() => setState(() => ({ lines: [], requestId: null })), [setState]);

  /** Request id for sending the current cart; stays the same if the send is retried. */
  const requestIdForSend = useCallback(() => {
    const id = state.requestId ?? uuid();
    if (!state.requestId) setState((s) => ({ ...s, requestId: id }));
    return id;
  }, [state.requestId, setState]);

  const total = state.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const count = state.lines.reduce((s, l) => s + l.qty, 0);
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    state.lines.forEach((l) => m.set(l.product_id, (m.get(l.product_id) ?? 0) + l.qty));
    return m;
  }, [state.lines]);
  const items: NewItem[] = state.lines.map((l) => ({ product_id: l.product_id, qty: l.qty, comment: l.comment }));

  return { lines: state.lines, add, update, clear, total, count, counts, items, requestIdForSend };
}

const COMMENT_CHIPS = ['без лука', 'без соли', 'острое', 'не острое', 'без майонеза', 'с собой', 'побыстрее'];

interface CartListProps {
  lines: CartLine[];
  onUpdate(key: string, patch: Partial<CartLine>): void;
}

export function CartList({ lines, onUpdate }: CartListProps) {
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [comment, setComment] = useState('');

  if (lines.length === 0) return <p className="muted center pad">Нажмите на блюдо, чтобы добавить</p>;

  return (
    <>
      <ul className="cart-list">
        {lines.map((l) => (
          <li key={l.key} className="cart-line">
            <button className="cart-info" onClick={() => { setEditing(l); setComment(l.comment); }}>
              <span className="cart-name">{l.name}</span>
              {l.comment ? <span className="cart-comment">! {l.comment}</span> : <span className="cart-add-comment">+ комментарий</span>}
            </button>
            <div className="stepper">
              <button onClick={() => onUpdate(l.key, { qty: l.qty - 1 })} aria-label="Меньше">−</button>
              <span>{l.qty}</span>
              <button onClick={() => onUpdate(l.key, { qty: Math.min(l.qty + 1, 99) })} aria-label="Больше">+</button>
            </div>
            <span className="cart-sum">{money(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>
      {editing && (
        <Modal
          title={editing.name}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => { onUpdate(editing.key, { qty: 0 }); setEditing(null); }}>Убрать</button>
              <button className="btn btn-primary" onClick={() => { onUpdate(editing.key, { comment: comment.trim() }); setEditing(null); }}>Готово</button>
            </>
          }
        >
          <label className="field">
            <span>Комментарий для кухни</span>
            <input value={comment} maxLength={100} onChange={(e) => setComment(e.target.value)} autoFocus />
          </label>
          <div className="chips wrap">
            {COMMENT_CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => setComment((v) => (v ? `${v}, ${c}` : c))}>{c}</button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
