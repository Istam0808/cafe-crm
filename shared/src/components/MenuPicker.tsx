import { useMemo, useState } from 'react';
import { money } from '../format';
import type { Menu, Product } from '../types';

interface Props {
  menu: Menu;
  onAdd(product: Product): void;
  /** product id → quantity already in the cart, shown as a badge */
  counts: Map<number, number>;
}

export function MenuPicker({ menu, onAdd, counts }: Props) {
  const [categoryId, setCategoryId] = useState<number | null>(menu.categories[0]?.id ?? null);
  const [search, setSearch] = useState('');

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return menu.products.filter((p) => p.name.toLowerCase().includes(q));
    return menu.products.filter((p) => p.category_id === categoryId);
  }, [menu, categoryId, search]);

  return (
    <div className="menu-picker">
      <div className="menu-top">
        <input
          className="search"
          type="search"
          placeholder="Поиск блюда"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {!search && (
        <div className="chips" role="tablist">
          {menu.categories.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === categoryId}
              className={`chip ${c.id === categoryId ? 'active' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="product-grid">
        {products.map((p) => {
          const count = counts.get(p.id);
          return (
            <button key={p.id} className="product-tile" onClick={() => onAdd(p)}>
              {count ? <span className="badge">{count}</span> : null}
              <span className="product-name">{p.name}</span>
              <span className="product-price">{money(p.price)}</span>
            </button>
          );
        })}
        {products.length === 0 && <p className="muted">Ничего не найдено</p>}
      </div>
    </div>
  );
}
