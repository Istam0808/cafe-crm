import { groupBy, hhmm, money } from '../format';
import type { Order, OrderItem } from '../types';

interface Props {
  order: Order;
  /** Shown only to the cashier/admin; the waiter sees sent items locked. */
  onCancel?(item: OrderItem): void;
  showCancelled?: boolean;
}

/** Items already sent to the kitchen, grouped by round ("заход"). */
export function SentItems({ order, onCancel, showCancelled = true }: Props) {
  const rounds = groupBy(order.items, (i) => i.round);
  if (order.items.length === 0) return <p className="muted center pad">Позиций нет</p>;

  return (
    <div className="sent">
      {[...rounds.entries()].map(([round, items]) => {
        const visible = showCancelled ? items : items.filter((i) => i.status === 'active');
        if (visible.length === 0) return null;
        return (
          <section key={round} className="round">
            <div className="round-head">
              Заход {round} · {hhmm(items[0].added_at)} · {items[0].added_by_name}
            </div>
            <ul>
              {visible.map((i) => (
                <li key={i.id} className={`sent-line ${i.status === 'cancelled' ? 'cancelled' : ''}`}>
                  <span className="sent-name">
                    {onCancel ? null : <span className="lock" aria-label="отправлено">🔒</span>}
                    {i.name}
                    {i.comment && <span className="cart-comment"> ! {i.comment}</span>}
                    {i.status === 'cancelled' && (
                      <span className="cancel-note">
                        отменено {i.cancelled_by_name}{i.cancel_reason ? `: ${i.cancel_reason}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="sent-qty">{i.qty} × {money(i.price)}</span>
                  <span className="sent-sum">{money(i.qty * i.price)}</span>
                  {onCancel && (
                    <span className="sent-action">
                      {i.status === 'active' && order.status === 'open' && (
                        <button className="icon-btn danger" onClick={() => onCancel(i)} aria-label={`Отменить ${i.name}`}>✕</button>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
