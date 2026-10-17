import { Router } from 'express';
import { all } from '../db.ts';

export const floorRouter = Router();

floorRouter.get('/menu', (_req, res) => {
  const categories = all<{ id: number; name: string; station_id: number | null }>(
    'SELECT id, name, station_id FROM categories WHERE is_active = 1 ORDER BY sort, name',
  );
  const products = all<{ id: number; category_id: number; name: string; price: number }>(
    'SELECT id, category_id, name, price FROM products WHERE is_active = 1 ORDER BY sort, name',
  );
  res.json({ categories, products });
});

floorRouter.get('/floor', (_req, res) => {
  const zones = all('SELECT id, name, service_percent FROM zones WHERE is_active = 1 ORDER BY sort, name');
  const tables = all(
    `SELECT t.id, t.zone_id, t.name,
            o.id AS order_id, o.total, o.waiter_id, u.name AS waiter_name, o.opened_at,
            (SELECT COALESCE(SUM(qty), 0) FROM order_items i WHERE i.order_id = o.id AND i.status = 'active') AS items_count
     FROM tables t
     LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'open'
     LEFT JOIN users u ON u.id = o.waiter_id
     WHERE t.is_active = 1
     ORDER BY t.sort, t.name`,
  );
  res.json({ zones, tables });
});
