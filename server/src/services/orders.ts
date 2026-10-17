import { all, get, getSetting, now, run, setSetting, tx } from '../db.ts';
import { isManager, type User } from '../auth.ts';
import { fail } from '../http.ts';
import { broadcast } from '../realtime.ts';
import { enqueue, getPrinter, profileOf } from '../printing/queue.ts';
import { kitchenTicket, receiptTicket } from '../printing/tickets.ts';

export interface OrderRow {
  id: number;
  table_id: number;
  waiter_id: number;
  status: 'open' | 'paid' | 'cancelled';
  rounds: number;
  service_percent: number;
  discount: number;
  subtotal: number;
  service_amount: number;
  total: number;
  paid_cash: number;
  paid_card: number;
  change_given: number;
  cashier_id: number | null;
  receipt_no: number | null;
  void_reason: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  price: number;
  qty: number;
  station_id: number | null;
  round: number;
  comment: string;
  status: 'active' | 'cancelled';
  added_by: number;
  added_at: string;
  cancelled_by: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface NewItem {
  productId: number;
  qty: number;
  comment: string;
}

const userName = (id: number | null) => (id ? get<{ name: string }>('SELECT name FROM users WHERE id = ?', id)?.name ?? '' : '');

export function tableLabel(tableId: number): string {
  const row = get<{ zone: string; name: string }>(
    'SELECT z.name AS zone, t.name FROM tables t JOIN zones z ON z.id = t.zone_id WHERE t.id = ?',
    tableId,
  );
  return row ? `${row.zone} ${row.name}` : `#${tableId}`;
}

function loadOrder(orderId: number): OrderRow {
  return get<OrderRow>('SELECT * FROM orders WHERE id = ?', orderId) ?? fail(404, 'Заказ не найден');
}

function loadOpenOrder(orderId: number): OrderRow {
  const order = loadOrder(orderId);
  if (order.status !== 'open') fail(409, 'Заказ уже закрыт');
  return order;
}

export function getOrderDetails(orderId: number) {
  const order = loadOrder(orderId);
  const items = all<OrderItemRow & { added_by_name: string; cancelled_by_name: string | null; station_name: string | null }>(
    `SELECT i.*, u.name AS added_by_name, c.name AS cancelled_by_name, s.name AS station_name
     FROM order_items i
     JOIN users u ON u.id = i.added_by
     LEFT JOIN users c ON c.id = i.cancelled_by
     LEFT JOIN stations s ON s.id = i.station_id
     WHERE i.order_id = ? ORDER BY i.round, i.id`,
    orderId,
  );
  return {
    ...order,
    table_label: tableLabel(order.table_id),
    waiter_name: userName(order.waiter_id),
    cashier_name: userName(order.cashier_id),
    items,
  };
}

function recalc(orderId: number) {
  const order = loadOrder(orderId);
  const { subtotal } = get<{ subtotal: number }>(
    "SELECT COALESCE(SUM(price * qty), 0) AS subtotal FROM order_items WHERE order_id = ? AND status = 'active'",
    orderId,
  )!;
  const serviceAmount = Math.round((subtotal * order.service_percent) / 100);
  const discount = Math.min(order.discount, subtotal + serviceAmount);
  const total = subtotal + serviceAmount - discount;
  run('UPDATE orders SET subtotal = ?, service_amount = ?, discount = ?, total = ? WHERE id = ?', subtotal, serviceAmount, discount, total, orderId);
}

function notify(orderId: number) {
  broadcast({ type: 'floor' });
  broadcast({ type: 'order', orderId });
}

/**
 * One "Отправить" from a waiter (or the cashier): opens the table if needed, stores the items
 * as the next round and sends a ticket to every station that has something to cook.
 */
export function addItems(user: User, tableId: number, items: NewItem[], requestId: string) {
  if (items.length === 0) fail(400, 'Заказ пустой');
  const table = get<{ id: number; service_percent: number }>(
    'SELECT t.id, z.service_percent FROM tables t JOIN zones z ON z.id = t.zone_id WHERE t.id = ? AND t.is_active = 1',
    tableId,
  ) ?? fail(404, 'Стол не найден');

  const orderId = tx(() => {
    const repeated = get<{ order_id: number }>('SELECT order_id FROM rounds WHERE request_id = ?', requestId);
    if (repeated) return repeated.order_id;

    let order = get<OrderRow>("SELECT * FROM orders WHERE table_id = ? AND status = 'open'", table.id);
    if (order && user.role === 'waiter' && order.waiter_id !== user.id && getSetting('waiter_can_use_foreign_tables', '1') !== '1') {
      fail(403, 'Этот стол обслуживает другой официант');
    }
    if (!order) {
      const id = Number(
        run(
          'INSERT INTO orders (table_id, waiter_id, service_percent, opened_at) VALUES (?, ?, ?, ?)',
          table.id, user.id, table.service_percent, now(),
        ).lastInsertRowid,
      );
      order = loadOrder(id);
    }

    const round = order.rounds + 1;
    const ts = now();
    run('UPDATE orders SET rounds = ? WHERE id = ?', round, order.id);
    run('INSERT INTO rounds (order_id, round, request_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)', order.id, round, requestId, user.id, ts);

    for (const item of items) {
      const product = get<{ id: number; name: string; price: number; station_id: number | null }>(
        `SELECT p.id, p.name, p.price, COALESCE(p.station_id, c.station_id) AS station_id
         FROM products p JOIN categories c ON c.id = p.category_id
         WHERE p.id = ? AND p.is_active = 1 AND c.is_active = 1`,
        item.productId,
      ) ?? fail(400, 'Блюдо не найдено или снято с продажи');
      run(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, station_id, round, comment, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        order.id, product.id, product.name, product.price, item.qty, product.station_id, round, item.comment, user.id, ts,
      );
    }
    recalc(order.id);
    printRound(order.id, round, user);
    return order.id;
  });

  notify(orderId);
  return getOrderDetails(orderId);
}

function printRound(orderId: number, round: number, user: User) {
  const order = loadOrder(orderId);
  const rows = all<{ station_id: number; station: string; printer_id: number | null; name: string; qty: number; comment: string }>(
    `SELECT i.station_id, s.name AS station, s.printer_id, i.name, SUM(i.qty) AS qty, i.comment
     FROM order_items i JOIN stations s ON s.id = i.station_id
     WHERE i.order_id = ? AND i.round = ? AND i.status = 'active' AND s.is_active = 1
     GROUP BY i.station_id, i.product_id, i.comment
     ORDER BY s.id, MIN(i.id)`,
    orderId, round,
  );
  const byStation = Map.groupBy(rows, (r) => r.station_id);
  for (const stationRows of byStation.values()) {
    const { station, printer_id } = stationRows[0];
    const printer = getPrinter(printer_id);
    if (!printer) {
      console.warn(`[print] у цеха «${station}» нет принтера — тикет не напечатан`);
      continue;
    }
    const ticket = kitchenTicket(profileOf(printer), {
      station,
      table: tableLabel(order.table_id),
      orderId,
      round,
      waiter: user.role === 'waiter' ? user.name : `${userName(order.waiter_id)} (касса: ${user.name})`,
      time: now(),
      items: stationRows.map((r) => ({ name: r.name, qty: r.qty, comment: r.comment })),
    });
    enqueue(printer, 'kitchen', `${station}: стол ${tableLabel(order.table_id)}, заход ${round}`, ticket);
  }
}

function printCancel(order: OrderRow, item: { name: string; qty: number; station_id: number | null }, reason: string, user: User) {
  if (!item.station_id) return;
  const station = get<{ name: string; printer_id: number | null }>('SELECT name, printer_id FROM stations WHERE id = ?', item.station_id);
  const printer = getPrinter(station?.printer_id);
  if (!station || !printer) return;
  const ticket = kitchenTicket(profileOf(printer), {
    station: station.name,
    table: tableLabel(order.table_id),
    orderId: order.id,
    round: order.rounds,
    waiter: userName(order.waiter_id),
    time: now(),
    items: [{ name: item.name, qty: item.qty, comment: '' }],
    cancel: { reason, by: user.name },
  });
  enqueue(printer, 'cancel', `ОТМЕНА ${station.name}: ${item.qty} x ${item.name}`, ticket);
}

/** Only the cashier/admin may take back something already sent to the kitchen. */
export function cancelItem(user: User, orderId: number, itemId: number, qty: number, reason: string) {
  if (!isManager(user)) fail(403, 'Официант не может удалять отправленные позиции');
  tx(() => {
    const order = loadOpenOrder(orderId);
    const item = get<OrderItemRow>("SELECT * FROM order_items WHERE id = ? AND order_id = ? AND status = 'active'", itemId, orderId)
      ?? fail(404, 'Позиция не найдена');
    if (qty > item.qty) fail(400, 'Нельзя отменить больше, чем заказано');
    const ts = now();
    if (qty === item.qty) {
      run("UPDATE order_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?", user.id, ts, reason, item.id);
    } else {
      // partial cancel: keep the rest active, record the cancelled part as its own row
      run('UPDATE order_items SET qty = qty - ? WHERE id = ?', qty, item.id);
      run(
        `INSERT INTO order_items (order_id, product_id, name, price, qty, station_id, round, comment, status, added_by, added_at, cancelled_by, cancelled_at, cancel_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cancelled', ?, ?, ?, ?, ?)`,
        orderId, item.product_id, item.name, item.price, qty, item.station_id, item.round, item.comment, item.added_by, item.added_at, user.id, ts, reason,
      );
    }
    recalc(orderId);
    printCancel(order, { name: item.name, qty, station_id: item.station_id }, reason, user);
  });
  notify(orderId);
  return getOrderDetails(orderId);
}

export function updateOrder(orderId: number, changes: { servicePercent?: number; discount?: number }) {
  tx(() => {
    loadOpenOrder(orderId);
    if (changes.servicePercent !== undefined) run('UPDATE orders SET service_percent = ? WHERE id = ?', changes.servicePercent, orderId);
    if (changes.discount !== undefined) run('UPDATE orders SET discount = ? WHERE id = ?', changes.discount, orderId);
    recalc(orderId);
  });
  notify(orderId);
  return getOrderDetails(orderId);
}

export function moveOrder(orderId: number, tableId: number) {
  tx(() => {
    const order = loadOpenOrder(orderId);
    if (order.table_id === tableId) return;
    get('SELECT id FROM tables WHERE id = ? AND is_active = 1', tableId) ?? fail(404, 'Стол не найден');
    if (get("SELECT id FROM orders WHERE table_id = ? AND status = 'open'", tableId)) fail(409, 'Этот стол занят');
    run('UPDATE orders SET table_id = ? WHERE id = ?', tableId, orderId);
  });
  notify(orderId);
  return getOrderDetails(orderId);
}

/** Identical dishes from all rounds collapse into one receipt line. */
function receiptLines(orderId: number) {
  return all<{ name: string; qty: number; price: number }>(
    `SELECT name, price, SUM(qty) AS qty FROM order_items
     WHERE order_id = ? AND status = 'active'
     GROUP BY product_id, price ORDER BY MIN(id)`,
    orderId,
  );
}

function printReceipt(orderId: number, kind: 'precheck' | 'receipt'): boolean {
  const printer = getPrinter(Number(getSetting('receipt_printer_id')) || null);
  if (!printer) return false;
  const o = getOrderDetails(orderId);
  const ticket = receiptTicket(profileOf(printer), {
    kind,
    orderId: o.id,
    receiptNo: o.receipt_no,
    table: o.table_label,
    waiter: o.waiter_name,
    cashier: o.cashier_name,
    openedAt: o.opened_at,
    closedAt: o.closed_at ?? now(),
    lines: receiptLines(orderId),
    subtotal: o.subtotal,
    servicePercent: o.service_percent,
    serviceAmount: o.service_amount,
    discount: o.discount,
    total: o.total,
    // paid_cash is stored net of change (for the cash report); the guest handed over more
    paidCash: o.paid_cash + o.change_given,
    paidCard: o.paid_card,
    change: o.change_given,
  });
  enqueue(printer, kind, `${kind === 'precheck' ? 'Пречек' : `Чек №${o.receipt_no}`}: стол ${o.table_label}`, ticket);
  return true;
}

export function precheck(orderId: number) {
  const order = loadOpenOrder(orderId);
  if (order.total === 0 && order.subtotal === 0) fail(400, 'В заказе нет позиций');
  return { printed: printReceipt(orderId, 'precheck') };
}

export function payOrder(user: User, orderId: number, cash: number, card: number) {
  const printed = tx(() => {
    const order = loadOpenOrder(orderId);
    if (order.subtotal === 0) fail(400, 'В заказе нет позиций — аннулируйте его');
    if (card > order.total) fail(400, 'Оплата картой больше суммы заказа');
    if (cash + card < order.total) fail(400, 'Недостаточно средств для оплаты');
    const change = cash + card - order.total;
    const receiptNo = Number(getSetting('next_receipt_no', '1'));
    setSetting('next_receipt_no', String(receiptNo + 1));
    run(
      `UPDATE orders SET status = 'paid', paid_cash = ?, paid_card = ?, change_given = ?, cashier_id = ?, receipt_no = ?, closed_at = ?
       WHERE id = ?`,
      cash - change, card, change, user.id, receiptNo, now(), orderId,
    );
    return printReceipt(orderId, 'receipt');
  });
  notify(orderId);
  return { order: getOrderDetails(orderId), printed };
}

/** Cancels the whole order; with dishes still on it this is an admin-only action. */
export function voidOrder(user: User, orderId: number, reason: string) {
  tx(() => {
    const order = loadOpenOrder(orderId);
    const active = all<OrderItemRow>("SELECT * FROM order_items WHERE order_id = ? AND status = 'active'", orderId);
    if (active.length > 0 && user.role !== 'admin') fail(403, 'Аннулировать заказ с позициями может только админ');
    const ts = now();
    for (const item of active) {
      run("UPDATE order_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ? WHERE id = ?", user.id, ts, reason, item.id);
      printCancel(order, item, reason, user);
    }
    run("UPDATE orders SET status = 'cancelled', void_reason = ?, cashier_id = ?, closed_at = ? WHERE id = ?", reason, user.id, ts, orderId);
    recalc(orderId);
  });
  notify(orderId);
  return getOrderDetails(orderId);
}

export function reprintReceipt(orderId: number) {
  const order = loadOrder(orderId);
  if (order.status !== 'paid') fail(409, 'Чек есть только у оплаченного заказа');
  return { printed: printReceipt(orderId, 'receipt') };
}
