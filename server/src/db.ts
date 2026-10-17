import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { hashPin } from './pin.ts';

export const DATA_DIR = resolve(import.meta.dirname, '..', 'data');
const DB_PATH = process.env.XAZORA_DB ?? resolve(DATA_DIR, 'xazora.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

type Params = SQLInputValue[];

export function all<T>(sql: string, ...params: Params): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Params): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: Params) {
  return db.prepare(sql).run(...params);
}

let txDepth = 0;

/** Runs fn inside a transaction; nested calls join the outer one. */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();
  txDepth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    txDepth--;
  }
}

/** Local timestamp "YYYY-MM-DD HH:MM:SS" — the café works in one time zone. */
export function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function getSetting(key: string, fallback = ''): string {
  return get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'waiter')),
    pin_hash TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE zones (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    service_percent REAL NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE tables (
    id INTEGER PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES zones(id),
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE printers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    port INTEGER NOT NULL DEFAULT 9100,
    codepage TEXT NOT NULL DEFAULT 'cp866' CHECK (codepage IN ('cp866', 'cp1251')),
    codepage_id INTEGER NOT NULL DEFAULT 17,
    width INTEGER NOT NULL DEFAULT 80 CHECK (width IN (58, 80)),
    emulate INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE stations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    printer_id INTEGER REFERENCES printers(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    table_id INTEGER NOT NULL REFERENCES tables(id),
    waiter_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
    rounds INTEGER NOT NULL DEFAULT 0,
    service_percent REAL NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    subtotal INTEGER NOT NULL DEFAULT 0,
    service_amount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    paid_cash INTEGER NOT NULL DEFAULT 0,
    paid_card INTEGER NOT NULL DEFAULT 0,
    change_given INTEGER NOT NULL DEFAULT 0,
    cashier_id INTEGER REFERENCES users(id),
    receipt_no INTEGER,
    void_reason TEXT,
    opened_at TEXT NOT NULL,
    closed_at TEXT
  );
  -- one open order per table
  CREATE UNIQUE INDEX orders_one_open_per_table ON orders(table_id) WHERE status = 'open';
  CREATE INDEX orders_closed_at ON orders(closed_at);

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    qty INTEGER NOT NULL CHECK (qty > 0),
    station_id INTEGER REFERENCES stations(id) ON DELETE SET NULL,
    round INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    added_by INTEGER NOT NULL REFERENCES users(id),
    added_at TEXT NOT NULL,
    cancelled_by INTEGER REFERENCES users(id),
    cancelled_at TEXT,
    cancel_reason TEXT
  );
  CREATE INDEX order_items_order ON order_items(order_id);

  -- one row per "Отправить" from a waiter; request_id makes a retried request harmless
  CREATE TABLE rounds (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id),
    round INTEGER NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE print_jobs (
    id INTEGER PRIMARY KEY,
    printer_id INTEGER NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    data BLOB NOT NULL,
    preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    printed_at TEXT
  );
  CREATE INDEX print_jobs_status ON print_jobs(status);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

function migrate() {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    tx(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
    console.log(`[db] migration ${v + 1} applied`);
  }
  if (version === 0) seed();
}

/** Demo data so the system is usable right after the first start. */
function seed() {
  tx(() => {
    const ts = now();
    const users: [string, string, string][] = [
      ['Админ', 'admin', '0000'],
      ['Кассир', 'cashier', '1111'],
      ['Али', 'waiter', '1234'],
      ['Азиз', 'waiter', '4321'],
    ];
    for (const [name, role, pin] of users) {
      run('INSERT INTO users (name, role, pin_hash, created_at) VALUES (?, ?, ?, ?)', name, role, hashPin(pin), ts);
    }

    const hall = Number(run("INSERT INTO zones (name, service_percent, sort) VALUES ('Зал', 10, 1)").lastInsertRowid);
    const street = Number(run("INSERT INTO zones (name, service_percent, sort) VALUES ('Улица', 0, 2)").lastInsertRowid);
    for (let i = 1; i <= 12; i++) run('INSERT INTO tables (zone_id, name, sort) VALUES (?, ?, ?)', hall, String(i), i);
    for (let i = 1; i <= 8; i++) run('INSERT INTO tables (zone_id, name, sort) VALUES (?, ?, ?)', street, `У${i}`, i);

    const printer = (name: string, ip: string) =>
      Number(run('INSERT INTO printers (name, ip, emulate) VALUES (?, ?, 1)', name, ip).lastInsertRowid);
    const cashPrinter = printer('Касса', '192.168.1.50');
    const station = (name: string, ip: string) =>
      Number(run('INSERT INTO stations (name, printer_id) VALUES (?, ?)', name, printer(name, ip)).lastInsertRowid);
    const hot = station('Горячий цех', '192.168.1.51');
    const salad = station('Салатница', '192.168.1.52');
    const fastfood = station('Фаст-фуд', '192.168.1.53');
    const bar = station('Бар', '192.168.1.54');

    const menu: [string, number | null, [string, number][]][] = [
      ['Горячие блюда', hot, [['Плов', 35000], ['Лагман', 30000], ['Шурпа', 28000], ['Манты (5 шт)', 30000], ['Казан-кабоб', 55000]]],
      ['Салаты', salad, [['Ачичук', 12000], ['Цезарь', 32000], ['Оливье', 20000], ['Овощной', 18000]]],
      ['Фаст-фуд', fastfood, [['Бургер', 32000], ['Чизбургер', 36000], ['Хот-дог', 20000], ['Лаваш', 28000], ['Картофель фри', 15000]]],
      ['Напитки', bar, [['Чай зелёный (чайник)', 8000], ['Чай чёрный (чайник)', 8000], ['Кофе американо', 15000], ['Компот', 8000]]],
      ['Холодильник', null, [['Вода 0.5', 4000], ['Coca-Cola 0.5', 9000], ['Сок 1 л', 18000]]],
      ['Хлеб', null, [['Лепёшка', 5000]]],
    ];
    menu.forEach(([catName, stationId, products], ci) => {
      const catId = Number(run('INSERT INTO categories (name, station_id, sort) VALUES (?, ?, ?)', catName, stationId, ci + 1).lastInsertRowid);
      products.forEach(([name, price], pi) => {
        run('INSERT INTO products (category_id, name, price, sort) VALUES (?, ?, ?, ?)', catId, name, price, pi + 1);
      });
    });

    setSetting('cafe_name', 'Xazora City');
    setSetting('currency', 'сум');
    setSetting('receipt_printer_id', String(cashPrinter));
    setSetting('receipt_header', '');
    setSetting('receipt_footer', 'Спасибо! Ждём вас снова!');
    setSetting('waiter_can_use_foreign_tables', '1');
    setSetting('next_receipt_no', '1');
  });
  console.log('[db] demo data created (PIN: Админ 0000, Кассир 1111, Али 1234, Азиз 4321)');
}

migrate();
