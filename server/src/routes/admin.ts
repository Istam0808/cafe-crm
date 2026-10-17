import { Router } from 'express';
import type { SQLInputValue } from 'node:sqlite';
import { all, get, getSetting, now, run, setSetting } from '../db.ts';
import { bool, fail, int, num, str } from '../http.ts';
import { hashPin } from '../pin.ts';
import { Ticket } from '../printing/escpos.ts';
import { enqueue, getPrinter, profileOf } from '../printing/queue.ts';

export const adminRouter = Router();

type Field = (value: unknown) => SQLInputValue;

const nullableId = (field: string): Field => (v) => (v === null || v === '' || v === undefined ? null : int(v, field, { min: 1 }));

interface Resource {
  table: string;
  fields: Record<string, Field>;
  defaults?: Record<string, SQLInputValue>;
  order: string;
  /** Columns returned to the client; pin_hash must never leave the server. */
  select?: string;
}

// Records are never deleted (orders reference them) — they are switched off with is_active = 0.
const resources: Record<string, Resource> = {
  zones: {
    table: 'zones',
    order: 'sort, name',
    fields: {
      name: (v) => str(v, 'название', { max: 50 }),
      service_percent: (v) => num(v, 'обслуживание', { max: 100 }),
      sort: (v) => int(v, 'порядок'),
      is_active: bool,
    },
    defaults: { service_percent: 0, sort: 0, is_active: 1 },
  },
  tables: {
    table: 'tables',
    order: 'zone_id, sort, name',
    fields: {
      zone_id: (v) => int(v, 'зона', { min: 1 }),
      name: (v) => str(v, 'название', { max: 20 }),
      sort: (v) => int(v, 'порядок'),
      is_active: bool,
    },
    defaults: { sort: 0, is_active: 1 },
  },
  printers: {
    table: 'printers',
    order: 'name',
    fields: {
      name: (v) => str(v, 'название', { max: 50 }),
      ip: (v) => str(v, 'IP', { min: 0, max: 64 }),
      port: (v) => int(v, 'порт', { min: 1, max: 65535 }),
      codepage: (v) => (v === 'cp1251' ? 'cp1251' : 'cp866'),
      codepage_id: (v) => int(v, 'номер кодовой страницы', { max: 255 }),
      width: (v) => (Number(v) === 58 ? 58 : 80),
      emulate: bool,
      is_active: bool,
    },
    defaults: { ip: '', port: 9100, codepage: 'cp866', codepage_id: 17, width: 80, emulate: 0, is_active: 1 },
  },
  stations: {
    table: 'stations',
    order: 'name',
    fields: { name: (v) => str(v, 'название', { max: 50 }), printer_id: nullableId('принтер'), is_active: bool },
    defaults: { printer_id: null, is_active: 1 },
  },
  categories: {
    table: 'categories',
    order: 'sort, name',
    fields: {
      name: (v) => str(v, 'название', { max: 50 }),
      station_id: nullableId('цех'),
      sort: (v) => int(v, 'порядок'),
      is_active: bool,
    },
    defaults: { station_id: null, sort: 0, is_active: 1 },
  },
  products: {
    table: 'products',
    order: 'category_id, sort, name',
    fields: {
      category_id: (v) => int(v, 'категория', { min: 1 }),
      name: (v) => str(v, 'название', { max: 80 }),
      price: (v) => int(v, 'цена', { max: 100_000_000 }),
      station_id: nullableId('цех'),
      sort: (v) => int(v, 'порядок'),
      is_active: bool,
    },
    defaults: { station_id: null, sort: 0, is_active: 1 },
  },
  users: {
    table: 'users',
    order: 'role, name',
    select: 'id, name, role, is_active, created_at',
    fields: {
      name: (v) => str(v, 'имя', { max: 50 }),
      role: (v) => (v === 'admin' || v === 'cashier' || v === 'waiter' ? v : fail(400, 'Некорректная роль')),
      pin_hash: (v) => {
        if (typeof v !== 'string' || !/^\d{4,6}$/.test(v)) fail(400, 'PIN — от 4 до 6 цифр');
        return hashPin(v as string);
      },
      is_active: bool,
    },
    defaults: { is_active: 1 },
  },
};

function parseBody(resource: Resource, body: Record<string, unknown>, creating: boolean) {
  const values: Record<string, SQLInputValue> = {};
  for (const [key, parse] of Object.entries(resource.fields)) {
    // the API takes "pin", the table stores its hash; an empty PIN on edit means "keep"
    const value = key === 'pin_hash' ? body.pin : body[key];
    if (value === undefined || (key === 'pin_hash' && value === '')) continue;
    values[key] = parse(value);
  }
  if (creating) {
    for (const [key, value] of Object.entries(resource.defaults ?? {})) {
      if (!(key in values)) values[key] = value;
    }
    for (const key of Object.keys(resource.fields)) {
      if (!(key in values)) fail(400, key === 'pin_hash' ? 'Укажите PIN' : `Не заполнено поле: ${key}`);
    }
    if (resource.table === 'users') values.created_at = now();
  }
  return values;
}

const SETTING_KEYS = ['cafe_name', 'currency', 'receipt_printer_id', 'receipt_header', 'receipt_footer', 'waiter_can_use_foreign_tables'];
const readSettings = () => Object.fromEntries(SETTING_KEYS.map((k) => [k, getSetting(k)]));

adminRouter.get('/settings', (_req, res) => {
  res.json(readSettings());
});

adminRouter.put('/settings', (req, res) => {
  for (const key of SETTING_KEYS) {
    const value = req.body?.[key];
    if (value !== undefined) setSetting(key, String(value).slice(0, 500));
  }
  res.json(readSettings());
});

adminRouter.post('/printers/:id/test', (req, res) => {
  const printer = getPrinter(int(req.params.id, 'принтер', { min: 1 })) ?? fail(404, 'Принтер не найден или отключён');
  const t = new Ticket(profileOf(printer));
  t.setAlign('center').bold(true).setSize('big').line('ТЕСТ').setSize('normal').bold(false);
  t.line(printer.name).line(`${printer.ip}:${printer.port}`).line(`${printer.codepage} (${printer.codepage_id}), ${printer.width} мм`);
  t.setAlign('left').divider();
  t.line('Кириллица: АБВГДЕЁЖЗ абвгдеёжз №');
  t.line('0123456789');
  enqueue(printer, 'test', `Тест: ${printer.name}`, t.cut());
  res.json({ ok: true });
});

adminRouter.get('/:resource', (req, res) => {
  const r = resources[req.params.resource] ?? fail(404, 'Неизвестный раздел');
  res.json(all(`SELECT ${r.select ?? '*'} FROM ${r.table} ORDER BY ${r.order}`));
});

adminRouter.post('/:resource', (req, res) => {
  const r = resources[req.params.resource] ?? fail(404, 'Неизвестный раздел');
  const values = parseBody(r, req.body ?? {}, true);
  const keys = Object.keys(values);
  const id = run(
    `INSERT INTO ${r.table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    ...Object.values(values),
  ).lastInsertRowid;
  res.json(get(`SELECT ${r.select ?? '*'} FROM ${r.table} WHERE id = ?`, id));
});

adminRouter.put('/:resource/:id', (req, res) => {
  const r = resources[req.params.resource] ?? fail(404, 'Неизвестный раздел');
  const id = int(req.params.id, 'id', { min: 1 });
  const values = parseBody(r, req.body ?? {}, false);
  if (r.table === 'users' && id === req.user.id && (values.is_active === 0 || (values.role !== undefined && values.role !== 'admin'))) {
    fail(400, 'Нельзя отключить или понизить самого себя');
  }
  const keys = Object.keys(values);
  if (keys.length) run(`UPDATE ${r.table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(values), id);
  // a disabled employee is logged out everywhere
  if (r.table === 'users' && values.is_active === 0) run('DELETE FROM sessions WHERE user_id = ?', id);
  res.json(get(`SELECT ${r.select ?? '*'} FROM ${r.table} WHERE id = ?`, id) ?? fail(404, 'Запись не найдена'));
});
