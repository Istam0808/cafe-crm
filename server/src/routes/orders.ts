import { Router } from 'express';
import { all } from '../db.ts';
import { requireRole } from '../auth.ts';
import { fail, int, num, optStr, str } from '../http.ts';
import {
  addItems, cancelItem, getOrderDetails, moveOrder, payOrder, precheck, reprintReceipt, updateOrder, voidOrder, type NewItem,
} from '../services/orders.ts';

export const ordersRouter = Router();
const manager = requireRole('admin', 'cashier');

ordersRouter.post('/tables/:id/items', (req, res) => {
  const tableId = int(req.params.id, 'стол', { min: 1 });
  const requestId = str(req.body?.requestId, 'requestId', { min: 8, max: 64 });
  const raw = req.body?.items;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) fail(400, 'Заказ пустой');
  const items: NewItem[] = raw.map((it: any) => ({
    productId: int(it?.productId, 'блюдо', { min: 1 }),
    qty: int(it?.qty, 'количество', { min: 1, max: 99 }),
    comment: optStr(it?.comment, 'комментарий', 100),
  }));
  res.json(addItems(req.user, tableId, items, requestId));
});

ordersRouter.get('/orders', manager, (req, res) => {
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
  if (!date) fail(400, 'Укажите дату');
  res.json(
    all(
      `SELECT o.id, o.receipt_no, o.status, o.total, o.paid_cash, o.paid_card, o.opened_at, o.closed_at, o.void_reason,
              z.name || ' ' || t.name AS table_label, w.name AS waiter_name, c.name AS cashier_name
       FROM orders o
       JOIN tables t ON t.id = o.table_id JOIN zones z ON z.id = t.zone_id
       JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.cashier_id
       WHERE o.status != 'open' AND date(o.closed_at) = ?
       ORDER BY o.closed_at DESC`,
      date,
    ),
  );
});

ordersRouter.get('/orders/:id', (req, res) => {
  res.json(getOrderDetails(int(req.params.id, 'заказ', { min: 1 })));
});

ordersRouter.post('/orders/:id/items/:itemId/cancel', (req, res) => {
  res.json(
    cancelItem(
      req.user,
      int(req.params.id, 'заказ', { min: 1 }),
      int(req.params.itemId, 'позиция', { min: 1 }),
      int(req.body?.qty, 'количество', { min: 1, max: 99 }),
      optStr(req.body?.reason, 'причина', 100),
    ),
  );
});

ordersRouter.patch('/orders/:id', manager, (req, res) => {
  const body = req.body ?? {};
  res.json(
    updateOrder(int(req.params.id, 'заказ', { min: 1 }), {
      servicePercent: body.servicePercent === undefined ? undefined : num(body.servicePercent, 'обслуживание', { max: 100 }),
      discount: body.discount === undefined ? undefined : int(body.discount, 'скидка'),
    }),
  );
});

ordersRouter.post('/orders/:id/move', manager, (req, res) => {
  res.json(moveOrder(int(req.params.id, 'заказ', { min: 1 }), int(req.body?.tableId, 'стол', { min: 1 })));
});

ordersRouter.post('/orders/:id/precheck', manager, (req, res) => {
  res.json(precheck(int(req.params.id, 'заказ', { min: 1 })));
});

ordersRouter.post('/orders/:id/pay', manager, (req, res) => {
  res.json(
    payOrder(req.user, int(req.params.id, 'заказ', { min: 1 }), int(req.body?.cash ?? 0, 'наличные'), int(req.body?.card ?? 0, 'карта')),
  );
});

ordersRouter.post('/orders/:id/reprint', manager, (req, res) => {
  res.json(reprintReceipt(int(req.params.id, 'заказ', { min: 1 })));
});

ordersRouter.post('/orders/:id/void', manager, (req, res) => {
  res.json(voidOrder(req.user, int(req.params.id, 'заказ', { min: 1 }), str(req.body?.reason, 'причина', { max: 100 })));
});
