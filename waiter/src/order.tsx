import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@shared/api';
import { CartList, useCart } from '@shared/components/Cart';
import { Modal } from '@shared/components/Modal';
import { SentItems } from '@shared/components/SentItems';
import { toast, toastError } from '@shared/components/Toast';
import { money } from '@shared/format';
import { useFloor, useMenu, useOrder } from '@shared/hooks';
import type { Product } from '@shared/types';

// Order taking on a phone/tablet: categories → dishes → cart. The cart lives in localStorage
// (useCart), so all three screens of one table see the same cart.

/** Card colours, cycled by category position. */
const CARD_COLORS = ['#f9bf92', '#c9dba6', '#f6ddb4', '#f0b0ae', '#f1e07e', '#b9d8e8'];

function useTable() {
  const tableId = Number(useParams().tableId);
  const floor = useFloor();
  const table = floor.data?.tables.find((t) => t.id === tableId);
  const zone = floor.data?.zones.find((z) => z.id === table?.zone_id);
  const cart = useCart(`table-${tableId}`);
  const title = table && zone ? `${zone.name} · стол ${table.name}` : 'Стол';
  return { tableId, table, zone, cart, title, base: `/table/${tableId}` };
}

const dishes = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} блюдо`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} блюда`;
  return `${n} блюд`;
};

export function CategoriesScreen() {
  const { zone, cart, title, base } = useTable();
  const menu = useMenu();
  const navigate = useNavigate();

  return (
    <div className="w-screen">
      <WaiterHeader title={title} back={zone ? `/zone/${zone.id}` : '/'} />
      <div className="w-content">
        {!menu.data && <p className="muted center pad">Загрузка меню…</p>}
        <div className="w-cards">
          {menu.data?.categories.map((c, i) => {
            const products = menu.data!.products.filter((p) => p.category_id === c.id);
            const inCart = products.reduce((s, p) => s + (cart.counts.get(p.id) ?? 0), 0);
            return (
              <button
                key={c.id}
                className="w-category"
                style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
                onClick={() => navigate(`${base}/category/${c.id}`)}
              >
                <span className="w-category-text">
                  <span className="w-category-name">{c.name}</span>
                  <span className="w-category-sub">
                    {dishes(products.length)}
                    {inCart > 0 && <b> · в корзине {inCart}</b>}
                  </span>
                </span>
                <Photo src={c.image} alt={c.name} className="w-category-photo" />
              </button>
            );
          })}
        </div>
      </div>
      <CartFooter count={cart.count} total={cart.total} onClick={() => navigate(`${base}/cart`)} />
    </div>
  );
}

export function ProductsScreen() {
  const categoryId = Number(useParams().categoryId);
  const { cart, base } = useTable();
  const menu = useMenu();
  const navigate = useNavigate();
  const category = menu.data?.categories.find((c) => c.id === categoryId);
  const products = menu.data?.products.filter((p) => p.category_id === categoryId) ?? [];

  const add = (p: Product) => {
    cart.add(p);
    navigator.vibrate?.(15);
  };

  return (
    <div className="w-screen">
      <WaiterHeader title={category?.name ?? 'Блюда'} back={base} />
      <div className="w-content">
        {!menu.data && <p className="muted center pad">Загрузка меню…</p>}
        <div className="w-products">
          {products.map((p) => {
            const count = cart.counts.get(p.id) ?? 0;
            return (
              <button key={p.id} className={`w-product ${count ? 'in-cart' : ''}`} onClick={() => add(p)}>
                <Photo src={p.image} alt={p.name} className="w-product-photo" />
                <span className="w-product-text">
                  <span className="w-product-name">{p.name}</span>
                  <span className="w-product-price">{money(p.price)}</span>
                </span>
                <span className="w-add" aria-label="Добавить">{count ? `×${count}` : '+'}</span>
              </button>
            );
          })}
        </div>
        {menu.data && products.length === 0 && <p className="muted center pad">В этой категории пока нет блюд</p>}
      </div>
      <CartFooter count={cart.count} total={cart.total} onClick={() => navigate(`${base}/cart`)} />
    </div>
  );
}

export function CartScreen() {
  const { tableId, table, zone, cart, title, base } = useTable();
  const order = useOrder(table?.order?.id ?? null);
  const menu = useMenu();
  const navigate = useNavigate();
  const photo = (productId: number) => menu.data?.products.find((p) => p.id === productId)?.image ?? null;
  const [panel, setPanel] = useState<'cart' | 'sent'>('cart');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const sentCount = order.data?.items.filter((i) => i.status === 'active').reduce((s, i) => s + i.qty, 0) ?? 0;

  async function send() {
    setSending(true);
    try {
      await api.sendRound(tableId, cart.requestIdForSend(), cart.items);
      cart.clear();
      setConfirming(false);
      toast('Отправлено на кухню', 'success');
      navigate(zone ? `/zone/${zone.id}` : '/');
    } catch (err) {
      toastError(err);
      // network failure: keep the cart and its request id, so "Отправить" again is safe
      if (!(err instanceof ApiError && err.status === 0)) setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="w-screen">
      <WaiterHeader title={title} back={base} />
      <div className="w-segmented">
        <button className={panel === 'cart' ? 'active' : ''} onClick={() => setPanel('cart')}>
          Корзина {cart.count ? `(${cart.count})` : ''}
        </button>
        <button className={panel === 'sent' ? 'active' : ''} onClick={() => setPanel('sent')}>
          Отправлено {sentCount ? `(${sentCount})` : ''}
        </button>
      </div>
      <div className="w-content w-sheet">
        {panel === 'cart' ? (
          cart.count ? (
            <CartList lines={cart.lines} onUpdate={cart.update} photo={photo} />
          ) : (
            <div className="w-empty">
              <p className="muted">Корзина пуста</p>
              <button className="btn btn-lg w-btn-soft" onClick={() => navigate(base)}>Открыть меню</button>
            </div>
          )
        ) : order.data ? (
          <>
            <SentItems order={order.data} showCancelled={false} />
            <p className="muted small pad">Отправленное может изменить только кассир.</p>
          </>
        ) : (
          <p className="muted center pad">Стол ещё не открыт</p>
        )}
      </div>
      <footer className="w-footer">
        {order.data && (
          <div className="row-between muted small">
            <span>Уже на столе</span>
            <span>{money(order.data.total)}</span>
          </div>
        )}
        <button className="w-cta" disabled={cart.count === 0} onClick={() => setConfirming(true)}>
          <span>Отправить на кухню</span>
          <span>{money(cart.total)}</span>
        </button>
      </footer>

      {confirming && (
        <Modal
          title={`Отправить на ${title}?`}
          onClose={() => !sending && setConfirming(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirming(false)} disabled={sending}>Назад</button>
              <button className="btn btn-primary" onClick={() => void send()} disabled={sending}>
                {sending ? 'Отправка…' : 'Отправить'}
              </button>
            </>
          }
        >
          <ul className="confirm-list">
            {cart.lines.map((l) => (
              <li key={l.key}>
                <b>{l.qty} ×</b> {l.name}
                {l.comment && <span className="cart-comment"> ! {l.comment}</span>}
              </li>
            ))}
          </ul>
          <p className="row-between"><span>Итого</span><b>{money(cart.total)}</b></p>
          <p className="muted small">После отправки удалить позиции сможет только кассир.</p>
        </Modal>
      )}
    </div>
  );
}

function WaiterHeader({ title, back }: { title: string; back: string }) {
  const navigate = useNavigate();
  return (
    <header className="w-header">
      <button className="w-icon-btn" onClick={() => navigate(back)} aria-label="Назад">
        <Icon d="M15 18l-6-6 6-6" />
      </button>
      <h1 className="w-title">{title}</h1>
      {/* keeps the title centred */}
      <span className="w-icon-btn-placeholder" />
    </header>
  );
}

/** Fixed "go to cart" bar, shown once something is in the cart. */
function CartFooter({ count, total, onClick }: { count: number; total: number; onClick(): void }) {
  if (count === 0) return null;
  return (
    <footer className="w-footer w-footer-float">
      <button className="w-cta" onClick={onClick}>
        <span className="w-cta-count">{count}</span>
        <span>Перейти в корзину</span>
        <span>{money(total)}</span>
      </button>
    </footer>
  );
}

function Photo({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={`${className} w-photo-empty`}>{alt.slice(0, 1)}</span>;
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
