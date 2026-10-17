import { getSetting } from '../db.ts';
import { money, Ticket, type PrinterProfile } from './escpos.ts';

export interface KitchenTicketInput {
  station: string;
  table: string;
  orderId: number;
  round: number;
  waiter: string;
  time: string;
  items: { name: string; qty: number; comment: string }[];
  /** Set for a cancellation ticket. */
  cancel?: { reason: string; by: string };
}

export function kitchenTicket(profile: PrinterProfile, t: KitchenTicketInput): Ticket {
  const tk = new Ticket(profile);
  tk.setAlign('center').bold(true);
  if (t.cancel) tk.setSize('big').line('*** ОТМЕНА ***');
  tk.setSize('wide').line(t.station.toUpperCase());
  tk.setSize('big').line(`СТОЛ ${t.table}`);
  tk.setSize('normal').bold(false).setAlign('left');
  tk.row(`Заказ №${t.orderId}`, t.cancel ? '' : `заход ${t.round}`);
  tk.row(`Официант: ${t.waiter}`, t.time.slice(11, 16));
  tk.divider('=');
  tk.bold(true).setSize('tall');
  for (const item of t.items) {
    tk.line(`${item.qty} x ${item.name}`);
    if (item.comment) tk.setSize('normal').line(`   ! ${item.comment}`).setSize('tall');
  }
  tk.setSize('normal').bold(false);
  if (t.cancel) {
    tk.divider();
    tk.line(`Причина: ${t.cancel.reason || '-'}`);
    tk.line(`Отменил: ${t.cancel.by}`);
  }
  return tk.cut();
}

export interface ReceiptInput {
  kind: 'precheck' | 'receipt';
  orderId: number;
  receiptNo: number | null;
  table: string;
  waiter: string;
  cashier: string;
  openedAt: string;
  closedAt: string;
  lines: { name: string; qty: number; price: number }[];
  subtotal: number;
  servicePercent: number;
  serviceAmount: number;
  discount: number;
  total: number;
  paidCash: number;
  paidCard: number;
  change: number;
}

export function receiptTicket(profile: PrinterProfile, r: ReceiptInput): Ticket {
  const currency = getSetting('currency', 'сум');
  const header = getSetting('receipt_header');
  const footer = getSetting('receipt_footer');
  const tk = new Ticket(profile);

  tk.setAlign('center').bold(true).setSize('big').line(getSetting('cafe_name', 'Xazora City'));
  tk.setSize('normal').bold(false);
  if (header) header.split('\n').forEach((l) => tk.line(l));
  tk.feed(1);
  if (r.kind === 'precheck') tk.bold(true).line('СЧЁТ (ПРЕЧЕК)').bold(false);
  else tk.bold(true).line(`ЧЕК №${r.receiptNo}`).bold(false);

  tk.setAlign('left');
  tk.row(`Стол: ${r.table}`, `Заказ №${r.orderId}`);
  tk.row(`Официант: ${r.waiter}`, '');
  if (r.kind === 'receipt') tk.row(`Кассир: ${r.cashier}`, '');
  tk.row('Открыт:', r.openedAt.slice(0, 16));
  if (r.kind === 'receipt') tk.row('Закрыт:', r.closedAt.slice(0, 16));
  tk.divider();

  for (const l of r.lines) {
    tk.line(l.name);
    tk.row(`  ${l.qty} x ${money(l.price)}`, money(l.qty * l.price));
  }
  tk.divider();
  tk.row('Сумма', money(r.subtotal));
  if (r.serviceAmount > 0) tk.row(`Обслуживание ${r.servicePercent}%`, money(r.serviceAmount));
  if (r.discount > 0) tk.row('Скидка', '-' + money(r.discount));
  tk.bold(true).setSize('tall').row('ИТОГО', `${money(r.total)} ${currency}`).setSize('normal').bold(false);

  if (r.kind === 'receipt') {
    tk.divider();
    if (r.paidCash > 0) tk.row('Наличные', money(r.paidCash));
    if (r.paidCard > 0) tk.row('Карта', money(r.paidCard));
    if (r.change > 0) tk.row('Сдача', money(r.change));
  }

  tk.feed(1).setAlign('center');
  if (r.kind === 'precheck') tk.line('Не является фискальным чеком');
  else if (footer) footer.split('\n').forEach((l) => tk.line(l));
  return tk.cut();
}

export interface DayReport {
  date: string;
  revenue: number;
  checks: number;
  avgCheck: number;
  cash: number;
  card: number;
  service: number;
  discount: number;
  products: { name: string; qty: number; sum: number }[];
  categories: { name: string; qty: number; sum: number }[];
  waiters: { name: string; checks: number; sum: number }[];
  cancelled: { name: string; qty: number; sum: number; by: string; reason: string; time: string }[];
  open: { table: string; waiter: string; total: number }[];
}

export function dayReportTicket(profile: PrinterProfile, r: DayReport, printedBy: string, printedAt: string): Ticket {
  const tk = new Ticket(profile);
  tk.setAlign('center').bold(true).setSize('wide').line('X-ОТЧЁТ').setSize('normal');
  tk.line(getSetting('cafe_name', 'Xazora City')).bold(false);
  tk.line(`за ${r.date}`);
  tk.setAlign('left').divider();
  tk.bold(true).row('ВЫРУЧКА', money(r.revenue)).bold(false);
  tk.row('Чеков', String(r.checks));
  tk.row('Средний чек', money(r.avgCheck));
  tk.row('Наличные', money(r.cash));
  tk.row('Карта', money(r.card));
  tk.row('Обслуживание', money(r.service));
  tk.row('Скидки', money(r.discount));

  tk.divider().bold(true).line('ПО КАТЕГОРИЯМ').bold(false);
  for (const c of r.categories) tk.row(`${c.name} (${c.qty})`, money(c.sum));

  tk.divider().bold(true).line('ПО БЛЮДАМ').bold(false);
  for (const p of r.products) tk.row(`${p.name} x${p.qty}`, money(p.sum));

  tk.divider().bold(true).line('ПО ОФИЦИАНТАМ').bold(false);
  for (const w of r.waiters) tk.row(`${w.name} (${w.checks})`, money(w.sum));

  if (r.cancelled.length) {
    tk.divider().bold(true).line('ОТМЕНЫ').bold(false);
    for (const c of r.cancelled) tk.row(`${c.name} x${c.qty} (${c.by})`, money(c.sum));
  }
  if (r.open.length) {
    tk.divider().bold(true).line('НЕ ОПЛАЧЕНО').bold(false);
    for (const o of r.open) tk.row(`Стол ${o.table} (${o.waiter})`, money(o.total));
  }
  tk.divider().line(`Печать: ${printedBy}, ${printedAt.slice(0, 16)}`);
  return tk.cut();
}
