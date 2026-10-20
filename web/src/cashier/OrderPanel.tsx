import { useState } from 'react';
import { api } from '@shared/api';
import { useAuth } from '@shared/auth';
import { CartList, useCart } from '@shared/components/Cart';
import { MenuPicker } from '@shared/components/MenuPicker';
import { Modal } from '@shared/components/Modal';
import { SentItems } from '@shared/components/SentItems';
import { TableGrid } from '@shared/components/TableGrid';
import { toast, toastError } from '@shared/components/Toast';
import { hhmm, money } from '@shared/format';
import { useMenu, useOrder } from '@shared/hooks';
import type { Floor, FloorTable, Order, OrderItem } from '@shared/types';

interface Props {
  table: FloorTable;
  floor: Floor;
}

type Dialog = null | 'add' | 'pay' | 'move' | 'totals' | 'void' | { cancel: OrderItem };

export function OrderPanel({ table, floor }: Props) {
  const { user } = useAuth();
  const { data: order, loading, setData } = useOrder(table.order?.id ?? null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const zone = floor.zones.find((z) => z.id === table.zone_id);
  const close = () => setDialog(null);

  async function run<T>(fn: () => Promise<T>, done?: (r: T) => void) {
    setBusy(true);
    try {
      const r = await fn();
      done?.(r);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  const precheck = () =>
    run(() => api.precheck(order!.id), (r) => toast(r.printed ? 'Пречек отправлен на печать' : 'Принтер кассы не выбран в настройках', r.printed ? 'success' : 'error'));

  return (
    <div className="order-detail">
      <div className="order-detail-head">
        <div>
          <h2>{zone?.name} · стол {table.name}</h2>
          {order && (
            <p className="muted">
              Заказ №{order.id} · {order.waiter_name} · открыт {hhmm(order.opened_at)}
            </p>
          )}
        </div>
        <button className="btn" onClick={() => setDialog('add')}>+ Добавить</button>
      </div>

      {!table.order ? (
        <div className="empty-state">
          <p>Стол свободен</p>
          <button className="btn btn-primary btn-lg" onClick={() => setDialog('add')}>Открыть заказ</button>
        </div>
      ) : !order ? (
        <p className="muted pad">{loading ? 'Загрузка…' : 'Не удалось загрузить заказ'}</p>
      ) : (
        <>
          <div className="order-items-scroll">
            <SentItems order={order} onCancel={(item) => setDialog({ cancel: item })} />
          </div>

          <div className="totals">
            <div className="row-between"><span>Сумма</span><span>{money(order.subtotal)}</span></div>
            <button className="row-between link-row" onClick={() => setDialog('totals')}>
              <span>Обслуживание {order.service_percent}% ✎</span><span>{money(order.service_amount)}</span>
            </button>
            <button className="row-between link-row" onClick={() => setDialog('totals')}>
              <span>Скидка ✎</span><span>{order.discount ? `−${money(order.discount)}` : '0'}</span>
            </button>
            <div className="row-between total-line"><span>ИТОГО</span><span>{money(order.total)}</span></div>
          </div>

          <div className="order-actions">
            <button className="btn" onClick={() => void precheck()} disabled={busy || order.subtotal === 0}>Пречек</button>
            <button className="btn" onClick={() => setDialog('move')} disabled={busy}>Пересадить</button>
            <button className="btn btn-danger-ghost" onClick={() => setDialog('void')} disabled={busy}>Аннулировать</button>
            <button className="btn btn-primary btn-lg grow" onClick={() => setDialog('pay')} disabled={busy || order.subtotal === 0}>
              Оплата · {money(order.total)}
            </button>
          </div>
        </>
      )}

      {dialog === 'add' && <AddItemsDialog table={table} title={`${zone?.name} · стол ${table.name}`} onClose={close} onDone={(o) => { setData(o); close(); }} />}
      {order && dialog === 'pay' && <PayDialog order={order} onClose={close} onDone={close} />}
      {order && dialog === 'move' && <MoveDialog order={order} floor={floor} onClose={close} />}
      {order && dialog === 'totals' && <TotalsDialog order={order} onClose={close} onDone={(o) => { setData(o); close(); }} />}
      {order && dialog === 'void' && (
        <VoidDialog order={order} canVoidWithItems={user?.role === 'admin'} onClose={close} />
      )}
      {order && dialog && typeof dialog === 'object' && (
        <CancelDialog order={order} item={dialog.cancel} onClose={close} onDone={(o) => { setData(o); close(); }} />
      )}
    </div>
  );
}

function AddItemsDialog({ table, title, onClose, onDone }: { table: FloorTable; title: string; onClose(): void; onDone(o: Order): void }) {
  const menu = useMenu();
  const cart = useCart(`cashier-table-${table.id}`);
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    try {
      const order = await api.sendRound(table.id, cart.requestIdForSend(), cart.items);
      cart.clear();
      toast('Отправлено на кухню', 'success');
      onDone(order);
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      title={`Добавить: ${title}`}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="grow muted">{cart.count} поз. · {money(cart.total)}</span>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={cart.count === 0 || sending} onClick={() => void send()}>
            {sending ? 'Отправка…' : 'Отправить на кухню'}
          </button>
        </>
      }
    >
      <div className="add-items">
        <div className="add-items-menu">{menu.data && <MenuPicker menu={menu.data} onAdd={cart.add} counts={cart.counts} />}</div>
        <div className="add-items-cart"><CartList lines={cart.lines} onUpdate={cart.update} /></div>
      </div>
    </Modal>
  );
}

const CASH_STEPS = [10_000, 50_000, 100_000, 200_000];

function PayDialog({ order, onClose, onDone }: { order: Order; onClose(): void; onDone(): void }) {
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed'>('cash');
  const [cashInput, setCashInput] = useState(String(order.total));
  const [cardInput, setCardInput] = useState('0');
  const [busy, setBusy] = useState(false);

  const parse = (s: string) => Math.max(0, Math.floor(Number(s.replace(/\s/g, '')) || 0));
  const card = method === 'card' ? order.total : method === 'mixed' ? Math.min(parse(cardInput), order.total) : 0;
  const cash = method === 'card' ? 0 : parse(cashInput);
  const change = cash + card - order.total;
  const enough = change >= 0;

  // quick buttons: the amount rounded up to common banknotes
  const suggestions = [...new Set(CASH_STEPS.map((step) => Math.ceil(order.total / step) * step))].filter((v) => v > order.total).slice(0, 3);

  async function pay() {
    setBusy(true);
    try {
      const r = await api.pay(order.id, cash, card);
      toast(`Оплачено. Чек №${r.order.receipt_no}${r.printed ? '' : ' (принтер кассы не выбран)'}`, 'success');
      onDone();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Оплата · ${order.table_label}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary btn-lg" disabled={!enough || busy} onClick={() => void pay()}>
            {busy ? 'Оплата…' : 'Принять оплату'}
          </button>
        </>
      }
    >
      <div className="pay-total">{money(order.total)}</div>
      <div className="segmented">
        {(['cash', 'card', 'mixed'] as const).map((m) => (
          <button key={m} className={method === m ? 'active' : ''} onClick={() => { setMethod(m); if (m === 'mixed') setCashInput('0'); if (m === 'cash') setCashInput(String(order.total)); }}>
            {{ cash: 'Наличные', card: 'Карта', mixed: 'Смешанно' }[m]}
          </button>
        ))}
      </div>

      {method === 'mixed' && (
        <label className="field">
          <span>Картой</span>
          <input inputMode="numeric" value={cardInput} onChange={(e) => setCardInput(e.target.value)} onFocus={(e) => e.target.select()} />
        </label>
      )}
      {method !== 'card' && (
        <>
          <label className="field">
            <span>Наличными получено</span>
            <input inputMode="numeric" value={cashInput} onChange={(e) => setCashInput(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
          </label>
          <div className="chips wrap">
            <button className="chip" onClick={() => setCashInput(String(Math.max(order.total - card, 0)))}>Без сдачи</button>
            {method === 'cash' && suggestions.map((v) => (
              <button key={v} className="chip" onClick={() => setCashInput(String(v))}>{money(v)}</button>
            ))}
          </div>
        </>
      )}

      <div className={`pay-change ${enough ? '' : 'bad'}`}>
        {enough ? <>Сдача: <b>{money(change)}</b></> : <>Не хватает: <b>{money(-change)}</b></>}
      </div>
    </Modal>
  );
}

const CANCEL_REASONS = ['Гость передумал', 'Ошибка официанта', 'Долго ждали', 'Нет в наличии', 'Брак'];

function CancelDialog({ order, item, onClose, onDone }: { order: Order; item: OrderItem; onClose(): void; onDone(o: Order): void }) {
  const [qty, setQty] = useState(item.qty);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const o = await api.cancelItem(order.id, item.id, qty, reason.trim());
      toast(item.station_name ? `Отменено, тикет отправлен в «${item.station_name}»` : 'Позиция отменена', 'success');
      onDone(o);
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Отменить: ${item.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Назад</button>
          <button className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => void confirm()}>
            Отменить {qty} шт · −{money(qty * item.price)}
          </button>
        </>
      }
    >
      {item.qty > 1 && (
        <div className="row-between">
          <span>Сколько отменить (из {item.qty})</span>
          <div className="stepper">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <span>{qty}</span>
            <button onClick={() => setQty((q) => Math.min(item.qty, q + 1))}>+</button>
          </div>
        </div>
      )}
      <label className="field">
        <span>Причина</span>
        <input value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="chips wrap">
        {CANCEL_REASONS.map((r) => (
          <button key={r} className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)}>{r}</button>
        ))}
      </div>
      {item.station_name && <p className="muted small">В «{item.station_name}» будет напечатан тикет «ОТМЕНА».</p>}
    </Modal>
  );
}

function TotalsDialog({ order, onClose, onDone }: { order: Order; onClose(): void; onDone(o: Order): void }) {
  const [service, setService] = useState(String(order.service_percent));
  const [discount, setDiscount] = useState(String(order.discount));
  const [busy, setBusy] = useState(false);
  const base = order.subtotal + Math.round((order.subtotal * (Number(service) || 0)) / 100);

  async function save() {
    setBusy(true);
    try {
      onDone(await api.updateOrder(order.id, { service_percent: Number(service) || 0, discount: Math.floor(Number(discount) || 0) }));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Обслуживание и скидка"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Применить</button>
        </>
      }
    >
      <label className="field">
        <span>Обслуживание, %</span>
        <input inputMode="decimal" value={service} onChange={(e) => setService(e.target.value)} onFocus={(e) => e.target.select()} />
      </label>
      <div className="chips wrap">
        {[0, 5, 10, 15].map((p) => (
          <button key={p} className="chip" onClick={() => setService(String(p))}>{p}%</button>
        ))}
      </div>
      <label className="field">
        <span>Скидка, сум</span>
        <input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} onFocus={(e) => e.target.select()} />
      </label>
      <div className="chips wrap">
        {[0, 5, 10, 20].map((p) => (
          <button key={p} className="chip" onClick={() => setDiscount(String(Math.round((base * p) / 100)))}>{p}%</button>
        ))}
      </div>
    </Modal>
  );
}

function MoveDialog({ order, floor, onClose }: { order: Order; floor: Floor; onClose(): void }) {
  async function move(tableId: number) {
    try {
      await api.moveOrder(order.id, tableId);
      toast('Стол пересажен', 'success');
      onClose();
    } catch (err) {
      toastError(err);
    }
  }
  return (
    <Modal title={`Пересадить ${order.table_label} на…`} onClose={onClose} wide>
      {floor.zones.map((z) => (
        <section key={z.id} className="zone-section">
          <h3>{z.name}</h3>
          <TableGrid tables={floor.tables.filter((t) => t.zone_id === z.id)} freeOnly onPick={(t) => void move(t.id)} />
        </section>
      ))}
    </Modal>
  );
}

function VoidDialog({ order, canVoidWithItems, onClose }: { order: Order; canVoidWithItems: boolean; onClose(): void }) {
  const [reason, setReason] = useState('');
  const hasItems = order.items.some((i) => i.status === 'active');

  async function confirm() {
    try {
      await api.voidOrder(order.id, reason.trim());
      toast('Заказ аннулирован', 'success');
      onClose();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <Modal
      title={`Аннулировать заказ №${order.id}?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Назад</button>
          <button className="btn btn-danger" disabled={!reason.trim() || (hasItems && !canVoidWithItems)} onClick={() => void confirm()}>
            Аннулировать
          </button>
        </>
      }
    >
      {hasItems && !canVoidWithItems ? (
        <p>В заказе есть позиции. Аннулировать такой заказ может только админ. Можно отменить позиции по одной.</p>
      ) : (
        <>
          {hasItems && <p>Все позиции будут отменены, в цеха уйдут тикеты «ОТМЕНА».</p>}
          <label className="field">
            <span>Причина</span>
            <input value={reason} maxLength={100} onChange={(e) => setReason(e.target.value)} autoFocus />
          </label>
        </>
      )}
    </Modal>
  );
}
