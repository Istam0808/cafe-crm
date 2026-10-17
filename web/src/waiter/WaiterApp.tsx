import { useState } from 'react';
import { Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { CartList, useCart } from '../components/Cart';
import { MenuPicker } from '../components/MenuPicker';
import { Modal } from '../components/Modal';
import { SentItems } from '../components/SentItems';
import { TableGrid } from '../components/TableGrid';
import { toast, toastError } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { money } from '../format';
import { useFloor, useMenu, useOrder } from '../hooks';

export function WaiterApp() {
  return (
    <Routes>
      <Route index element={<Zones />} />
      <Route path="zone/:zoneId" element={<Tables />} />
      <Route path="table/:tableId" element={<OrderScreen />} />
    </Routes>
  );
}

function Zones() {
  const { data } = useFloor();
  const navigate = useNavigate();
  return (
    <div className="screen">
      <TopBar title="Где сидят гости?" />
      <div className="zone-grid">
        {data?.zones.map((z) => {
          const tables = data.tables.filter((t) => t.zone_id === z.id);
          const busy = tables.filter((t) => t.order).length;
          return (
            <button key={z.id} className="zone-tile" onClick={() => navigate(`/waiter/zone/${z.id}`)}>
              <span className="zone-name">{z.name}</span>
              <span className="muted">занято {busy} из {tables.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tables() {
  const zoneId = Number(useParams().zoneId);
  const { data } = useFloor();
  const { user } = useAuth();
  const navigate = useNavigate();
  const zone = data?.zones.find((z) => z.id === zoneId);
  return (
    <div className="screen">
      <TopBar title={zone?.name ?? 'Столы'} back="/waiter" />
      <div className="legend">
        <span className="dot dot-free" /> свободен <span className="dot dot-mine" /> мой <span className="dot dot-busy" /> другой официант
      </div>
      {data && (
        <TableGrid
          tables={data.tables.filter((t) => t.zone_id === zoneId)}
          myId={user?.id}
          onPick={(t) => navigate(`/waiter/table/${t.id}`)}
        />
      )}
    </div>
  );
}

function OrderScreen() {
  const tableId = Number(useParams().tableId);
  const navigate = useNavigate();
  const floor = useFloor();
  const menu = useMenu();
  const table = floor.data?.tables.find((t) => t.id === tableId);
  const zone = floor.data?.zones.find((z) => z.id === table?.zone_id);
  const order = useOrder(table?.order?.id ?? null);
  const cart = useCart(`table-${tableId}`);
  const [panel, setPanel] = useState<'cart' | 'sent'>('cart');
  // on phones the menu and the cart take the whole screen in turns
  const [mobileView, setMobileView] = useState<'menu' | 'panel'>('menu');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const backPath = zone ? `/waiter/zone/${zone.id}` : '/waiter';
  const title = table && zone ? `${zone.name} · стол ${table.name}` : 'Стол';
  const sentCount = order.data?.items.filter((i) => i.status === 'active').reduce((s, i) => s + i.qty, 0) ?? 0;

  async function send() {
    setSending(true);
    try {
      await api.sendRound(tableId, cart.requestIdForSend(), cart.items);
      cart.clear();
      setConfirming(false);
      toast('Отправлено на кухню', 'success');
      navigate(backPath);
    } catch (err) {
      toastError(err);
      // network failure: keep the cart and its request id, so "Отправить" again is safe
      if (!(err instanceof ApiError && err.status === 0)) setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="screen order-screen">
      <TopBar title={title} back={backPath} />
      <div className={`order-layout view-${mobileView}`}>
        <div className="order-menu">
          {menu.data ? <MenuPicker menu={menu.data} onAdd={cart.add} counts={cart.counts} /> : <p className="muted pad">Загрузка меню…</p>}
        </div>

        <aside className="order-panel">
          <div className="tabs">
            <button className={panel === 'cart' ? 'active' : ''} onClick={() => setPanel('cart')}>
              Новое {cart.count ? `(${cart.count})` : ''}
            </button>
            <button className={panel === 'sent' ? 'active' : ''} onClick={() => setPanel('sent')}>
              Отправлено {sentCount ? `(${sentCount})` : ''}
            </button>
          </div>
          <div className="panel-body">
            {panel === 'cart' ? (
              <CartList lines={cart.lines} onUpdate={cart.update} />
            ) : order.data ? (
              <>
                <SentItems order={order.data} showCancelled={false} />
                <p className="muted small pad">Отправленное может изменить только кассир.</p>
              </>
            ) : (
              <p className="muted center pad">Стол ещё не открыт</p>
            )}
          </div>
          <div className="panel-foot">
            {order.data && (
              <div className="row-between muted">
                <span>Уже на столе</span>
                <span>{money(order.data.total)}</span>
              </div>
            )}
            <button className="btn btn-primary btn-block btn-lg" disabled={cart.count === 0} onClick={() => setConfirming(true)}>
              Отправить {cart.count ? `· ${money(cart.total)}` : ''}
            </button>
          </div>
        </aside>
      </div>

      <div className="mobile-bar">
        {mobileView === 'menu' ? (
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setMobileView('panel')}>
            Заказ: {cart.count} поз. · {money(cart.total)} →
          </button>
        ) : (
          <button className="btn btn-block btn-lg" onClick={() => setMobileView('menu')}>← Меню</button>
        )}
      </div>

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
