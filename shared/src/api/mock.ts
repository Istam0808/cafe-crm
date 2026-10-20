// Demo backend that runs entirely in the browser (localStorage), so the UI can be used and shown
// before the Django backend exists. It enforces the same business rules as PROJECT.md §2–3.

import type {
  AdminResource, AdminResources, ClosedOrder, DayReport, Order, PrintJob, RealtimeEvent, User,
} from '../types';
import { nowStamp } from '../format';
import { ApiError, type Api } from './types';
import { getToken } from './token';
import { MOCK_DB_VERSION, seedDb, type MockDb, type MockItem, type MockOrder, type MockUser } from './mockSeed';
import { dayReportText, kitchenText, receiptText, testText } from './tickets';

const STORAGE_KEY = 'xazora-demo-db';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('xazora-demo') : null;
const listeners = new Set<(event: RealtimeEvent) => void>();

channel?.addEventListener('message', (e: MessageEvent<RealtimeEvent>) => listeners.forEach((fn) => fn(e.data)));

/** Realtime events of the demo backend, from this tab and from other tabs of the same browser. */
export function onMockEvent(fn: (event: RealtimeEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit(event: RealtimeEvent) {
  listeners.forEach((fn) => fn(event));
  channel?.postMessage(event);
}

function load(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw) as MockDb;
      if (db.version === MOCK_DB_VERSION) return db;
    }
  } catch {
    // corrupted or unavailable storage — start over
  }
  const db = seedDb();
  save(db);
  return db;
}

function save(db: MockDb) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage full or blocked: the demo keeps working until reload
  }
}

export function resetDemo() {
  save(seedDb());
  emit({ type: 'floor' });
}

const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};

// a little latency so loading states are visible, like on real Wi-Fi
const delay = () => new Promise((r) => setTimeout(r, 120));

const nextId = (db: MockDb) => ++db.seq;

function me(db: MockDb): MockUser {
  const token = getToken();
  const session = db.sessions.find((s) => s.token === token);
  const user = session && db.users.find((u) => u.id === session.user_id && u.is_active);
  return user ?? fail(401, 'Нужно войти заново');
}

const isManager = (u: MockUser) => u.role === 'admin' || u.role === 'cashier';

function requireManager(u: MockUser) {
  if (!isManager(u)) fail(403, 'Недостаточно прав');
}

function requireAdmin(u: MockUser) {
  if (u.role !== 'admin') fail(403, 'Недостаточно прав');
}

const userName = (db: MockDb, id: number | null) => (id ? db.users.find((u) => u.id === id)?.name ?? '' : '');

function tableLabel(db: MockDb, tableId: number) {
  const table = db.tables.find((t) => t.id === tableId);
  const zone = table && db.zones.find((z) => z.id === table.zone_id);
  return table && zone ? `${zone.name} ${table.name}` : `#${tableId}`;
}

function findOrder(db: MockDb, id: number): MockOrder {
  return db.orders.find((o) => o.id === id) ?? fail(404, 'Заказ не найден');
}

function findOpenOrder(db: MockDb, id: number): MockOrder {
  const order = findOrder(db, id);
  if (order.status !== 'open') fail(409, 'Заказ уже закрыт');
  return order;
}

function details(db: MockDb, order: MockOrder): Order {
  const items = db.items
    .filter((i) => i.order_id === order.id)
    .sort((a, b) => a.round - b.round || a.id - b.id)
    .map((i) => ({
      id: i.id,
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      qty: i.qty,
      station_id: i.station_id,
      station_name: db.stations.find((s) => s.id === i.station_id)?.name ?? null,
      round: i.round,
      comment: i.comment,
      status: i.status,
      added_by_name: userName(db, i.added_by),
      added_at: i.added_at,
      cancelled_by_name: i.cancelled_by ? userName(db, i.cancelled_by) : null,
      cancelled_at: i.cancelled_at,
      cancel_reason: i.cancel_reason,
    }));
  return {
    id: order.id,
    table_id: order.table_id,
    table_label: tableLabel(db, order.table_id),
    waiter_id: order.waiter_id,
    waiter_name: userName(db, order.waiter_id),
    cashier_name: userName(db, order.cashier_id),
    status: order.status,
    rounds: order.rounds,
    service_percent: order.service_percent,
    discount: order.discount,
    subtotal: order.subtotal,
    service_amount: order.service_amount,
    total: order.total,
    paid_cash: order.paid_cash,
    paid_card: order.paid_card,
    change_given: order.change_given,
    receipt_no: order.receipt_no,
    void_reason: order.void_reason,
    opened_at: order.opened_at,
    closed_at: order.closed_at,
    items,
  };
}

function recalc(db: MockDb, order: MockOrder) {
  const subtotal = db.items.filter((i) => i.order_id === order.id && i.status === 'active').reduce((s, i) => s + i.price * i.qty, 0);
  const service = Math.round((subtotal * order.service_percent) / 100);
  order.subtotal = subtotal;
  order.service_amount = service;
  order.discount = Math.min(order.discount, subtotal + service);
  order.total = subtotal + service - order.discount;
}

// --- printing (emulated) ---

function enqueue(db: MockDb, printerId: number | null, kind: PrintJob['kind'], title: string, render: (width: 58 | 80) => string): boolean {
  const printer = db.printers.find((p) => p.id === printerId && p.is_active);
  if (!printer) return false;
  const job: PrintJob = {
    id: nextId(db),
    printer_id: printer.id,
    printer_name: printer.name,
    kind,
    title,
    status: printer.emulate ? 'done' : 'failed',
    error: printer.emulate ? null : 'Демо-режим: на настоящий принтер печатает только сервер',
    preview: render(printer.width),
    created_at: nowStamp(),
  };
  db.print_jobs.push(job);
  if (db.print_jobs.length > 300) db.print_jobs.splice(0, db.print_jobs.length - 300);
  queueMicrotask(() => emit({ type: 'print', job_id: job.id, status: job.status, printer: printer.name, error: job.error ?? undefined }));
  return true;
}

const stationPrinter = (db: MockDb, stationId: number | null) => {
  const station = db.stations.find((s) => s.id === stationId && s.is_active);
  return station ? { station, printerId: station.printer_id } : null;
};

function printRound(db: MockDb, order: MockOrder, round: number, user: MockUser) {
  const items = db.items.filter((i) => i.order_id === order.id && i.round === round && i.status === 'active' && i.station_id);
  const byStation = new Map<number, { name: string; qty: number; comment: string; product_id: number }[]>();
  for (const item of items) {
    const list = byStation.get(item.station_id!) ?? [];
    const same = list.find((l) => l.product_id === item.product_id && l.comment === item.comment);
    if (same) same.qty += item.qty;
    else list.push({ name: item.name, qty: item.qty, comment: item.comment, product_id: item.product_id });
    byStation.set(item.station_id!, list);
  }
  const table = tableLabel(db, order.table_id);
  for (const [stationId, list] of byStation) {
    const target = stationPrinter(db, stationId);
    if (!target) continue;
    const waiter = user.role === 'waiter' ? user.name : `${userName(db, order.waiter_id)} (касса: ${user.name})`;
    enqueue(db, target.printerId, 'kitchen', `${target.station.name}: стол ${table}, заход ${round}`, (w) =>
      kitchenText(w, { station: target.station.name, table, orderId: order.id, round, waiter, time: nowStamp(), items: list }),
    );
  }
}

function printCancel(db: MockDb, order: MockOrder, item: MockItem, qty: number, reason: string, user: MockUser) {
  const target = stationPrinter(db, item.station_id);
  if (!target) return;
  const table = tableLabel(db, order.table_id);
  enqueue(db, target.printerId, 'cancel', `ОТМЕНА ${target.station.name}: ${qty} x ${item.name}`, (w) =>
    kitchenText(w, {
      station: target.station.name,
      table,
      orderId: order.id,
      round: order.rounds,
      waiter: userName(db, order.waiter_id),
      time: nowStamp(),
      items: [{ name: item.name, qty, comment: '' }],
      cancel: { reason, by: user.name },
    }),
  );
}

function printReceipt(db: MockDb, order: MockOrder, kind: 'precheck' | 'receipt'): boolean {
  // identical dishes from all rounds collapse into one line
  const lines: { product_id: number; name: string; qty: number; price: number }[] = [];
  for (const i of db.items.filter((x) => x.order_id === order.id && x.status === 'active').sort((a, b) => a.id - b.id)) {
    const same = lines.find((l) => l.product_id === i.product_id && l.price === i.price);
    if (same) same.qty += i.qty;
    else lines.push({ product_id: i.product_id, name: i.name, qty: i.qty, price: i.price });
  }
  const s = db.settings;
  const table = tableLabel(db, order.table_id);
  return enqueue(db, s.receipt_printer_id, kind, kind === 'precheck' ? `Пречек: стол ${table}` : `Чек №${order.receipt_no}: стол ${table}`, (w) =>
    receiptText(w, {
      kind,
      cafeName: s.cafe_name,
      header: s.receipt_header,
      footer: s.receipt_footer,
      currency: s.currency,
      orderId: order.id,
      receiptNo: order.receipt_no,
      table,
      waiter: userName(db, order.waiter_id),
      cashier: userName(db, order.cashier_id),
      openedAt: order.opened_at,
      closedAt: order.closed_at ?? nowStamp(),
      lines,
      subtotal: order.subtotal,
      servicePercent: order.service_percent,
      serviceAmount: order.service_amount,
      discount: order.discount,
      total: order.total,
      cashGiven: order.paid_cash + order.change_given,
      card: order.paid_card,
      change: order.change_given,
    }),
  );
}

function buildDayReport(db: MockDb, date: string): DayReport {
  const paid = db.orders.filter((o) => o.status === 'paid' && o.closed_at?.startsWith(date));
  const sum = (f: (o: MockOrder) => number) => paid.reduce((s, o) => s + f(o), 0);
  const paidIds = new Set(paid.map((o) => o.id));
  const items = db.items.filter((i) => paidIds.has(i.order_id) && i.status === 'active');

  const group = <K,>(list: MockItem[], key: (i: MockItem) => K, name: (k: K) => string) => {
    const map = new Map<K, { name: string; qty: number; sum: number }>();
    for (const i of list) {
      const k = key(i);
      const row = map.get(k) ?? { name: name(k), qty: 0, sum: 0 };
      row.qty += i.qty;
      row.sum += i.qty * i.price;
      map.set(k, row);
    }
    return [...map.values()].sort((a, b) => b.sum - a.sum);
  };
  const categoryOf = (productId: number) => db.products.find((p) => p.id === productId)?.category_id ?? 0;

  const waiters = new Map<number, { name: string; checks: number; sum: number }>();
  for (const o of paid) {
    const row = waiters.get(o.waiter_id) ?? { name: userName(db, o.waiter_id), checks: 0, sum: 0 };
    row.checks++;
    row.sum += o.total;
    waiters.set(o.waiter_id, row);
  }

  const revenue = sum((o) => o.total);
  return {
    date,
    revenue,
    checks: paid.length,
    avg_check: paid.length ? Math.round(revenue / paid.length) : 0,
    cash: sum((o) => o.paid_cash),
    card: sum((o) => o.paid_card),
    service: sum((o) => o.service_amount),
    discount: sum((o) => o.discount),
    products: group(items, (i) => i.product_id, (id) => items.find((i) => i.product_id === id)!.name),
    categories: group(items, (i) => categoryOf(i.product_id), (id) => db.categories.find((c) => c.id === id)?.name ?? '—'),
    waiters: [...waiters.values()].sort((a, b) => b.sum - a.sum),
    cancelled: db.items
      .filter((i) => i.status === 'cancelled' && i.cancelled_at?.startsWith(date))
      .map((i) => ({ name: i.name, qty: i.qty, sum: i.qty * i.price, by: userName(db, i.cancelled_by), reason: i.cancel_reason ?? '', time: i.cancelled_at! })),
    open:
      date === nowStamp().slice(0, 10)
        ? db.orders
            .filter((o) => o.status === 'open')
            .map((o) => ({ table: tableLabel(db, o.table_id), waiter: userName(db, o.waiter_id), total: o.total }))
        : [],
  };
}

/** Runs a mutation on a fresh copy of the database and persists it only if nothing threw. */
async function mutate<T>(fn: (db: MockDb) => T, events: (result: T) => RealtimeEvent[] = () => []): Promise<T> {
  await delay();
  const db = load();
  const result = fn(db);
  save(db);
  events(result).forEach(emit);
  return result;
}

async function read<T>(fn: (db: MockDb) => T): Promise<T> {
  await delay();
  return fn(load());
}

const orderEvents = (order: Order): RealtimeEvent[] => [{ type: 'floor' }, { type: 'order', order_id: order.id }];

const publicUser = (u: MockUser): User => ({ id: u.id, name: u.name, role: u.role });

export const mockApi: Api = {
  loginUsers: () => read((db) => db.users.filter((u) => u.is_active).map(publicUser)),

  login: (pin, userId) =>
    mutate((db) => {
      const user = db.users.find((u) => u.is_active && u.pin === pin && (userId === undefined || u.id === userId));
      if (!user) fail(401, 'Неверный PIN');
      const token = `demo-${user!.id}-${Math.random().toString(36).slice(2)}`;
      db.sessions.push({ token, user_id: user!.id });
      return { token, user: publicUser(user!) };
    }),

  // A new tab inherits the login of the other tabs; revoking the token here would also log out
  // the waiter tab when the cashier tab logs out. The real backend does revoke it.
  logout: async () => {
    await delay();
  },

  menu: () =>
    read((db) => {
      me(db);
      const categories = db.categories.filter((c) => c.is_active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
      const activeCats = new Set(categories.map((c) => c.id));
      return {
        categories: categories.map((c) => ({ id: c.id, name: c.name, station_id: c.station_id, image: c.image ?? null })),
        products: db.products
          .filter((p) => p.is_active && activeCats.has(p.category_id))
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
          .map((p) => ({ id: p.id, category_id: p.category_id, name: p.name, price: p.price, image: p.image ?? null })),
      };
    }),

  floor: () =>
    read((db) => {
      me(db);
      return {
        zones: db.zones.filter((z) => z.is_active).sort((a, b) => a.sort - b.sort).map((z) => ({ id: z.id, name: z.name, service_percent: z.service_percent })),
        tables: db.tables
          .filter((t) => t.is_active)
          .sort((a, b) => a.sort - b.sort)
          .map((t) => {
            const o = db.orders.find((x) => x.table_id === t.id && x.status === 'open');
            return {
              id: t.id,
              zone_id: t.zone_id,
              name: t.name,
              order: o
                ? {
                    id: o.id,
                    total: o.total,
                    waiter_id: o.waiter_id,
                    waiter_name: userName(db, o.waiter_id),
                    opened_at: o.opened_at,
                    items_count: db.items.filter((i) => i.order_id === o.id && i.status === 'active').reduce((s, i) => s + i.qty, 0),
                  }
                : null,
            };
          }),
      };
    }),

  order: (id) =>
    read((db) => {
      me(db);
      return details(db, findOrder(db, id));
    }),

  sendRound: (tableId, requestId, items) =>
    mutate((db) => {
      const user = me(db);
      if (items.length === 0) fail(400, 'Заказ пустой');
      const repeated = db.rounds.find((r) => r.request_id === requestId);
      if (repeated) return details(db, findOrder(db, repeated.order_id));

      const table = db.tables.find((t) => t.id === tableId && t.is_active) ?? fail(404, 'Стол не найден');
      let order = db.orders.find((o) => o.table_id === table.id && o.status === 'open');
      if (order && user.role === 'waiter' && order.waiter_id !== user.id && !db.settings.waiter_can_use_foreign_tables) {
        fail(403, 'Этот стол обслуживает другой официант');
      }
      if (!order) {
        order = {
          id: nextId(db),
          table_id: table.id,
          waiter_id: user.id,
          status: 'open',
          rounds: 0,
          service_percent: db.zones.find((z) => z.id === table.zone_id)?.service_percent ?? 0,
          discount: 0,
          subtotal: 0,
          service_amount: 0,
          total: 0,
          paid_cash: 0,
          paid_card: 0,
          change_given: 0,
          cashier_id: null,
          receipt_no: null,
          void_reason: null,
          opened_at: nowStamp(),
          closed_at: null,
        };
        db.orders.push(order);
      }
      const round = ++order.rounds;
      db.rounds.push({ order_id: order.id, round, request_id: requestId });
      const ts = nowStamp();
      for (const item of items) {
        if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) fail(400, 'Некорректное количество');
        const product = db.products.find((p) => p.id === item.product_id && p.is_active) ?? fail(400, 'Блюдо снято с продажи');
        const category = db.categories.find((c) => c.id === product.category_id);
        db.items.push({
          id: nextId(db),
          order_id: order.id,
          product_id: product.id,
          name: product.name,
          price: product.price,
          qty: item.qty,
          station_id: product.station_id ?? category?.station_id ?? null,
          round,
          comment: item.comment.trim().slice(0, 100),
          status: 'active',
          added_by: user.id,
          added_at: ts,
          cancelled_by: null,
          cancelled_at: null,
          cancel_reason: null,
        });
      }
      recalc(db, order);
      printRound(db, order, round, user);
      return details(db, order);
    }, orderEvents),

  cancelItem: (orderId, itemId, qty, reason) =>
    mutate((db) => {
      const user = me(db);
      if (!isManager(user)) fail(403, 'Официант не может удалять отправленные позиции');
      const order = findOpenOrder(db, orderId);
      const item = db.items.find((i) => i.id === itemId && i.order_id === orderId && i.status === 'active') ?? fail(404, 'Позиция не найдена');
      if (!Number.isInteger(qty) || qty < 1 || qty > item.qty) fail(400, 'Некорректное количество');
      const ts = nowStamp();
      if (qty === item.qty) {
        Object.assign(item, { status: 'cancelled', cancelled_by: user.id, cancelled_at: ts, cancel_reason: reason });
      } else {
        // partial cancel: the rest stays active, the cancelled part becomes its own row
        item.qty -= qty;
        db.items.push({ ...item, id: nextId(db), qty, status: 'cancelled', cancelled_by: user.id, cancelled_at: ts, cancel_reason: reason });
      }
      recalc(db, order);
      printCancel(db, order, item, qty, reason, user);
      return details(db, order);
    }, orderEvents),

  updateOrder: (orderId, changes) =>
    mutate((db) => {
      requireManager(me(db));
      const order = findOpenOrder(db, orderId);
      if (changes.service_percent !== undefined) {
        if (!(changes.service_percent >= 0 && changes.service_percent <= 100)) fail(400, 'Некорректный процент');
        order.service_percent = changes.service_percent;
      }
      if (changes.discount !== undefined) {
        if (!Number.isInteger(changes.discount) || changes.discount < 0) fail(400, 'Некорректная скидка');
        order.discount = changes.discount;
      }
      recalc(db, order);
      return details(db, order);
    }, orderEvents),

  moveOrder: (orderId, tableId) =>
    mutate((db) => {
      requireManager(me(db));
      const order = findOpenOrder(db, orderId);
      if (!db.tables.some((t) => t.id === tableId && t.is_active)) fail(404, 'Стол не найден');
      if (db.orders.some((o) => o.table_id === tableId && o.status === 'open' && o.id !== orderId)) fail(409, 'Этот стол занят');
      order.table_id = tableId;
      return details(db, order);
    }, orderEvents),

  precheck: (orderId) =>
    mutate((db) => {
      requireManager(me(db));
      const order = findOpenOrder(db, orderId);
      if (order.subtotal === 0) fail(400, 'В заказе нет позиций');
      return { printed: printReceipt(db, order, 'precheck') };
    }),

  pay: (orderId, cash, card) =>
    mutate(
      (db) => {
        const user = me(db);
        requireManager(user);
        const order = findOpenOrder(db, orderId);
        if (order.subtotal === 0) fail(400, 'В заказе нет позиций — аннулируйте его');
        if (!Number.isInteger(cash) || !Number.isInteger(card) || cash < 0 || card < 0) fail(400, 'Некорректная сумма');
        if (card > order.total) fail(400, 'Оплата картой больше суммы заказа');
        if (cash + card < order.total) fail(400, 'Недостаточно средств для оплаты');
        const change = cash + card - order.total;
        Object.assign(order, {
          status: 'paid',
          paid_cash: cash - change,
          paid_card: card,
          change_given: change,
          cashier_id: user.id,
          receipt_no: db.next_receipt_no++,
          closed_at: nowStamp(),
        });
        const printed = printReceipt(db, order, 'receipt');
        return { order: details(db, order), printed };
      },
      (r) => orderEvents(r.order),
    ),

  voidOrder: (orderId, reason) =>
    mutate((db) => {
      const user = me(db);
      requireManager(user);
      if (!reason.trim()) fail(400, 'Укажите причину');
      const order = findOpenOrder(db, orderId);
      const active = db.items.filter((i) => i.order_id === orderId && i.status === 'active');
      if (active.length > 0 && user.role !== 'admin') fail(403, 'Аннулировать заказ с позициями может только админ');
      const ts = nowStamp();
      for (const item of active) {
        Object.assign(item, { status: 'cancelled', cancelled_by: user.id, cancelled_at: ts, cancel_reason: reason });
        printCancel(db, order, item, item.qty, reason, user);
      }
      Object.assign(order, { status: 'cancelled', void_reason: reason, cashier_id: user.id, closed_at: ts });
      recalc(db, order);
      return details(db, order);
    }, orderEvents),

  reprint: (orderId) =>
    mutate((db) => {
      requireManager(me(db));
      const order = findOrder(db, orderId);
      if (order.status !== 'paid') fail(409, 'Чек есть только у оплаченного заказа');
      return { printed: printReceipt(db, order, 'receipt') };
    }),

  closedOrders: (date) =>
    read((db) => {
      requireManager(me(db));
      return db.orders
        .filter((o) => o.status !== 'open' && o.closed_at?.startsWith(date))
        .sort((a, b) => b.closed_at!.localeCompare(a.closed_at!))
        .map(
          (o): ClosedOrder => ({
            id: o.id,
            receipt_no: o.receipt_no,
            status: o.status,
            total: o.total,
            paid_cash: o.paid_cash,
            paid_card: o.paid_card,
            opened_at: o.opened_at,
            closed_at: o.closed_at!,
            void_reason: o.void_reason,
            table_label: tableLabel(db, o.table_id),
            waiter_name: userName(db, o.waiter_id),
            cashier_name: userName(db, o.cashier_id),
          }),
        );
    }),

  dayReport: (date) =>
    read((db) => {
      requireManager(me(db));
      return buildDayReport(db, date);
    }),

  printDayReport: (date) =>
    mutate((db) => {
      const user = me(db);
      requireManager(user);
      const report = buildDayReport(db, date);
      const printed = enqueue(db, db.settings.receipt_printer_id, 'report', `X-отчёт за ${date}`, (w) =>
        dayReportText(w, db.settings.cafe_name, report, user.name, nowStamp()),
      );
      if (!printed) fail(400, 'Не выбран принтер кассы в настройках');
      return { printed };
    }),

  printJobs: () =>
    read((db) => {
      requireManager(me(db));
      return [...db.print_jobs].reverse().slice(0, 100);
    }),

  retryPrintJob: (id) =>
    mutate(
      (db) => {
        requireManager(me(db));
        const job = db.print_jobs.find((j) => j.id === id) ?? fail(404, 'Задание не найдено');
        const printer = db.printers.find((p) => p.id === job.printer_id);
        job.status = printer?.emulate ? 'done' : 'failed';
        job.error = printer?.emulate ? null : 'Демо-режим: на настоящий принтер печатает только сервер';
        return { ...job };
      },
      (job) => [{ type: 'print', job_id: job.id, status: job.status, printer: job.printer_name, error: job.error ?? undefined }],
    ),

  adminList: <R extends AdminResource>(resource: R) =>
    read((db) => {
      requireAdmin(me(db));
      const rows = db[resource] as unknown as AdminResources[R][];
      return resource === 'users' ? (rows.map((u) => ({ ...u, pin: undefined })) as AdminResources[R][]) : structuredClone(rows);
    }),

  adminCreate: <R extends AdminResource>(resource: R, data: Partial<AdminResources[R]>) =>
    mutate(
      (db) => {
        requireAdmin(me(db));
        const row = validate(db, resource, { ...defaults[resource], ...data } as AdminResources[R], true);
        (row as { id: number }).id = nextId(db);
        (db[resource] as unknown as AdminResources[R][]).push(row);
        return publicRow(resource, row);
      },
      () => [{ type: 'floor' }],
    ),

  adminUpdate: <R extends AdminResource>(resource: R, id: number, data: Partial<AdminResources[R]>) =>
    mutate(
      (db) => {
        const user = me(db);
        requireAdmin(user);
        const rows = db[resource] as unknown as AdminResources[R][];
        const index = rows.findIndex((r) => (r as { id: number }).id === id);
        if (index < 0) fail(404, 'Запись не найдена');
        const patch = { ...data };
        if (resource === 'users' && !(patch as { pin?: string }).pin) delete (patch as { pin?: string }).pin;
        const row = validate(db, resource, { ...rows[index], ...patch, id }, false);
        if (resource === 'users' && id === user.id) {
          const u = row as unknown as MockUser;
          if (!u.is_active || u.role !== 'admin') fail(400, 'Нельзя отключить или понизить самого себя');
        }
        rows[index] = row;
        if (resource === 'users' && !(row as unknown as MockUser).is_active) db.sessions = db.sessions.filter((s) => s.user_id !== id);
        return publicRow(resource, row);
      },
      () => [{ type: 'floor' }],
    ),

  settings: () =>
    read((db) => {
      requireAdmin(me(db));
      return { ...db.settings };
    }),

  saveSettings: (data) =>
    mutate((db) => {
      requireAdmin(me(db));
      if (!data.cafe_name.trim()) fail(400, 'Укажите название');
      db.settings = { ...data };
      return { ...db.settings };
    }),

  testPrinter: (id) =>
    mutate((db) => {
      requireAdmin(me(db));
      const p = db.printers.find((x) => x.id === id && x.is_active) ?? fail(404, 'Принтер не найден или отключён');
      enqueue(db, p.id, 'test', `Тест: ${p.name}`, (w) => testText(w, p.name, p.ip, p.port));
    }),
};

const defaults: { [R in AdminResource]: Partial<AdminResources[R]> } = {
  zones: { service_percent: 0, sort: 0, is_active: true },
  tables: { sort: 0, is_active: true },
  printers: { ip: '', port: 9100, codepage: 'cp866', codepage_id: 17, width: 80, emulate: true, is_active: true },
  stations: { printer_id: null, is_active: true },
  categories: { station_id: null, sort: 0, is_active: true },
  products: { station_id: null, sort: 0, is_active: true },
  users: { role: 'waiter', is_active: true },
};

function validate<R extends AdminResource>(db: MockDb, resource: R, row: AdminResources[R], creating: boolean): AdminResources[R] {
  const r = row as unknown as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) fail(400, 'Укажите название');
  r.name = (r.name as string).trim();
  if (resource === 'products' && (!Number.isInteger(r.price) || (r.price as number) < 0)) fail(400, 'Некорректная цена');
  if (resource === 'products' && !r.category_id) fail(400, 'Выберите категорию');
  if (resource === 'tables' && !r.zone_id) fail(400, 'Выберите зону');
  if (resource === 'users') {
    const pin = r.pin as string | undefined;
    if (creating && !pin) fail(400, 'Укажите PIN');
    if (pin !== undefined && !/^\d{4}$/.test(pin)) fail(400, 'PIN — ровно 4 цифры');
    // the waiter app logs in by PIN alone, so it must point to exactly one employee
    const u = row as unknown as MockUser;
    if (u.is_active && db.users.some((o) => o.id !== u.id && o.is_active && o.pin === u.pin)) {
      fail(400, 'Этот PIN уже у другого сотрудника');
    }
  }
  return row;
}

function publicRow<R extends AdminResource>(resource: R, row: AdminResources[R]): AdminResources[R] {
  return resource === 'users' ? ({ ...row, pin: undefined } as AdminResources[R]) : { ...row };
}
