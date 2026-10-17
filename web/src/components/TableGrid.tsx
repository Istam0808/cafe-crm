import { money, minutesSince } from '../format';
import type { FloorTable } from '../types';

interface Props {
  tables: FloorTable[];
  onPick(table: FloorTable): void;
  selectedId?: number | null;
  /** Highlights tables of this waiter as "мой". */
  myId?: number;
  /** Only free tables can be picked (used when moving an order). */
  freeOnly?: boolean;
}

export function TableGrid({ tables, onPick, selectedId, myId, freeOnly }: Props) {
  if (tables.length === 0) return <p className="muted">В этой зоне нет столов</p>;
  return (
    <div className="table-grid">
      {tables.map((t) => {
        const o = t.order;
        const state = !o ? 'free' : myId !== undefined && o.waiter_id === myId ? 'mine' : 'busy';
        return (
          <button
            key={t.id}
            className={`table-tile table-${state} ${selectedId === t.id ? 'selected' : ''}`}
            onClick={() => onPick(t)}
            disabled={freeOnly && !!o}
          >
            <span className="table-name">{t.name}</span>
            {o ? (
              <>
                <span className="table-sum">{money(o.total)}</span>
                <span className="table-meta">
                  {o.waiter_name} · {minutesSince(o.opened_at)} мин
                </span>
              </>
            ) : (
              <span className="table-meta">свободен</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
