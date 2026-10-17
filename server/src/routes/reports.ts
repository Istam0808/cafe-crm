import { Router } from 'express';
import { all, get, getSetting, now } from '../db.ts';
import { fail } from '../http.ts';
import { enqueue, getPrinter, profileOf } from '../printing/queue.ts';
import { dayReportTicket, type DayReport } from '../printing/tickets.ts';

export const reportsRouter = Router();

function parseDate(value: unknown): string {
  if (value === undefined) return now().slice(0, 10);
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'Некорректная дата');
  return value as string;
}

/** Item sums are menu prices; service and discounts are shown separately in the totals. */
export function buildDayReport(date: string): DayReport {
  const totals = get<{ revenue: number; checks: number; cash: number; card: number; service: number; discount: number }>(
    `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS checks, COALESCE(SUM(paid_cash), 0) AS cash,
            COALESCE(SUM(paid_card), 0) AS card, COALESCE(SUM(service_amount), 0) AS service, COALESCE(SUM(discount), 0) AS discount
     FROM orders WHERE status = 'paid' AND date(closed_at) = ?`,
    date,
  )!;
  const paidItems = `FROM order_items i
     JOIN orders o ON o.id = i.order_id
     JOIN products p ON p.id = i.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.status = 'paid' AND date(o.closed_at) = ? AND i.status = 'active'`;
  return {
    date,
    ...totals,
    avgCheck: totals.checks ? Math.round(totals.revenue / totals.checks) : 0,
    products: all(`SELECT i.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS sum ${paidItems} GROUP BY i.product_id ORDER BY sum DESC`, date),
    categories: all(`SELECT c.name, SUM(i.qty) AS qty, SUM(i.qty * i.price) AS sum ${paidItems} GROUP BY c.id ORDER BY sum DESC`, date),
    waiters: all(
      `SELECT u.name, COUNT(*) AS checks, SUM(o.total) AS sum FROM orders o JOIN users u ON u.id = o.waiter_id
       WHERE o.status = 'paid' AND date(o.closed_at) = ? GROUP BY u.id ORDER BY sum DESC`,
      date,
    ),
    cancelled: all(
      `SELECT i.name, i.qty, i.qty * i.price AS sum, u.name AS "by", COALESCE(i.cancel_reason, '') AS reason, i.cancelled_at AS time
       FROM order_items i JOIN users u ON u.id = i.cancelled_by
       WHERE i.status = 'cancelled' AND date(i.cancelled_at) = ? ORDER BY i.cancelled_at`,
      date,
    ),
    open:
      date === now().slice(0, 10)
        ? all(
            `SELECT z.name || ' ' || t.name AS "table", u.name AS waiter, o.total
             FROM orders o JOIN tables t ON t.id = o.table_id JOIN zones z ON z.id = t.zone_id JOIN users u ON u.id = o.waiter_id
             WHERE o.status = 'open' ORDER BY o.opened_at`,
          )
        : [],
  };
}

reportsRouter.get('/day', (req, res) => {
  res.json(buildDayReport(parseDate(req.query.date)));
});

reportsRouter.post('/day/print', (req, res) => {
  const printer = getPrinter(Number(getSetting('receipt_printer_id')) || null) ?? fail(400, 'Не выбран принтер кассы в настройках');
  const date = parseDate(req.body?.date);
  enqueue(printer, 'report', `X-отчёт за ${date}`, dayReportTicket(profileOf(printer), buildDayReport(date), req.user.name, now()));
  res.json({ printed: true });
});
