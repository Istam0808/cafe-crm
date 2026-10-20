// Plain-text layout of printed documents. The demo backend shows these instead of printing;
// the Django print worker should produce the same layout in ESC/POS.

import type { DayReport } from '../types';
import { money } from '../format';

class Text {
  private lines: string[] = [];
  readonly cols: number;

  constructor(width: 58 | 80) {
    this.cols = width === 80 ? 48 : 32;
  }

  line(text = '') {
    for (const part of wrap(text, this.cols)) this.lines.push(part);
    return this;
  }

  center(text: string) {
    for (const part of wrap(text, this.cols)) this.lines.push(' '.repeat(Math.floor((this.cols - part.length) / 2)) + part);
    return this;
  }

  /** Double-size text takes two columns per letter. */
  big(text: string) {
    const spread = text.toUpperCase().split('').join(' ');
    return this.center(spread);
  }

  row(left: string, right: string) {
    const parts = wrap(left, Math.max(this.cols - right.length - 1, 8));
    parts.forEach((p, i) => {
      this.lines.push(i === parts.length - 1 ? p + ' '.repeat(Math.max(this.cols - p.length - right.length, 1)) + right : p);
    });
    return this;
  }

  divider(ch = '-') {
    this.lines.push(ch.repeat(this.cols));
    return this;
  }

  toString() {
    return this.lines.join('\n');
  }
}

function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const out: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ' ' + word;
    else {
      out.push(current);
      current = word;
    }
    while (current.length > width) {
      out.push(current.slice(0, width));
      current = current.slice(width);
    }
  }
  if (current) out.push(current);
  return out;
}

export interface KitchenTicket {
  station: string;
  table: string;
  orderId: number;
  round: number;
  waiter: string;
  time: string;
  items: { name: string; qty: number; comment: string }[];
  cancel?: { reason: string; by: string };
}

export function kitchenText(width: 58 | 80, t: KitchenTicket): string {
  const tx = new Text(width);
  if (t.cancel) tx.big('*** отмена ***');
  tx.center(t.station.toUpperCase());
  tx.big(`стол ${t.table}`);
  tx.row(`Заказ №${t.orderId}`, t.cancel ? '' : `заход ${t.round}`);
  tx.row(`Официант: ${t.waiter}`, t.time.slice(11, 16));
  tx.divider('=');
  for (const item of t.items) {
    tx.line(`${item.qty} x ${item.name}`);
    if (item.comment) tx.line(`   ! ${item.comment}`);
  }
  if (t.cancel) {
    tx.divider();
    tx.line(`Причина: ${t.cancel.reason || '-'}`);
    tx.line(`Отменил: ${t.cancel.by}`);
  }
  return tx.toString();
}

export interface ReceiptData {
  kind: 'precheck' | 'receipt';
  cafeName: string;
  header: string;
  footer: string;
  currency: string;
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
  cashGiven: number;
  card: number;
  change: number;
}

export function receiptText(width: 58 | 80, r: ReceiptData): string {
  const tx = new Text(width);
  tx.big(r.cafeName);
  if (r.header) r.header.split('\n').forEach((l) => tx.center(l));
  tx.line();
  tx.center(r.kind === 'precheck' ? 'СЧЁТ (ПРЕЧЕК)' : `ЧЕК №${r.receiptNo}`);
  tx.row(`Стол: ${r.table}`, `Заказ №${r.orderId}`);
  tx.line(`Официант: ${r.waiter}`);
  if (r.kind === 'receipt') tx.line(`Кассир: ${r.cashier}`);
  tx.row('Открыт:', r.openedAt.slice(0, 16));
  if (r.kind === 'receipt') tx.row('Закрыт:', r.closedAt.slice(0, 16));
  tx.divider();
  for (const l of r.lines) {
    tx.line(l.name);
    tx.row(`  ${l.qty} x ${money(l.price)}`, money(l.qty * l.price));
  }
  tx.divider();
  tx.row('Сумма', money(r.subtotal));
  if (r.serviceAmount > 0) tx.row(`Обслуживание ${r.servicePercent}%`, money(r.serviceAmount));
  if (r.discount > 0) tx.row('Скидка', '-' + money(r.discount));
  tx.row('ИТОГО', `${money(r.total)} ${r.currency}`);
  if (r.kind === 'receipt') {
    tx.divider();
    if (r.cashGiven > 0) tx.row('Наличные', money(r.cashGiven));
    if (r.card > 0) tx.row('Карта', money(r.card));
    if (r.change > 0) tx.row('Сдача', money(r.change));
  }
  tx.line();
  if (r.kind === 'precheck') tx.center('Не является фискальным чеком');
  else if (r.footer) r.footer.split('\n').forEach((l) => tx.center(l));
  return tx.toString();
}

export function dayReportText(width: 58 | 80, cafeName: string, r: DayReport, by: string, at: string): string {
  const tx = new Text(width);
  tx.big('x-отчёт');
  tx.center(cafeName).center(`за ${r.date}`).divider();
  tx.row('ВЫРУЧКА', money(r.revenue));
  tx.row('Чеков', String(r.checks));
  tx.row('Средний чек', money(r.avg_check));
  tx.row('Наличные', money(r.cash));
  tx.row('Карта', money(r.card));
  tx.row('Обслуживание', money(r.service));
  tx.row('Скидки', money(r.discount));
  tx.divider().line('ПО КАТЕГОРИЯМ');
  r.categories.forEach((c) => tx.row(`${c.name} (${c.qty})`, money(c.sum)));
  tx.divider().line('ПО БЛЮДАМ');
  r.products.forEach((p) => tx.row(`${p.name} x${p.qty}`, money(p.sum)));
  tx.divider().line('ПО ОФИЦИАНТАМ');
  r.waiters.forEach((w) => tx.row(`${w.name} (${w.checks})`, money(w.sum)));
  if (r.cancelled.length) {
    tx.divider().line('ОТМЕНЫ');
    r.cancelled.forEach((c) => tx.row(`${c.name} x${c.qty} (${c.by})`, money(c.sum)));
  }
  if (r.open.length) {
    tx.divider().line('НЕ ОПЛАЧЕНО');
    r.open.forEach((o) => tx.row(`Стол ${o.table} (${o.waiter})`, money(o.total)));
  }
  tx.divider().line(`Печать: ${by}, ${at.slice(0, 16)}`);
  return tx.toString();
}

export function testText(width: 58 | 80, name: string, ip: string, port: number): string {
  return new Text(width).big('тест').center(name).center(`${ip}:${port}`).divider().line('Кириллица: АБВГДЕЁЖЗ абвгдеёжз №').line('0123456789').toString();
}
