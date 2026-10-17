import type {
  AdminCategory, AdminPrinter, AdminProduct, AdminStation, AdminTable, AdminZone, OrderStatus, PrintJob, Role, Settings,
} from '../types';

export interface MockUser { id: number; name: string; role: Role; pin: string; is_active: boolean }

export interface MockOrder {
  id: number;
  table_id: number;
  waiter_id: number;
  status: OrderStatus;
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

export interface MockItem {
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

export interface MockDb {
  version: number;
  seq: number;
  users: MockUser[];
  sessions: { token: string; user_id: number }[];
  zones: AdminZone[];
  tables: AdminTable[];
  printers: AdminPrinter[];
  stations: AdminStation[];
  categories: AdminCategory[];
  products: AdminProduct[];
  orders: MockOrder[];
  items: MockItem[];
  rounds: { order_id: number; round: number; request_id: string }[];
  print_jobs: PrintJob[];
  settings: Settings;
  next_receipt_no: number;
}

export const MOCK_DB_VERSION = 1;

export function seedDb(): MockDb {
  let seq = 0;
  const id = () => ++seq;

  const users: MockUser[] = [
    { id: id(), name: 'Админ', role: 'admin', pin: '0000', is_active: true },
    { id: id(), name: 'Кассир', role: 'cashier', pin: '1111', is_active: true },
    { id: id(), name: 'Али', role: 'waiter', pin: '1234', is_active: true },
    { id: id(), name: 'Азиз', role: 'waiter', pin: '4321', is_active: true },
  ];

  const hall: AdminZone = { id: id(), name: 'Зал', service_percent: 10, sort: 1, is_active: true };
  const street: AdminZone = { id: id(), name: 'Улица', service_percent: 0, sort: 2, is_active: true };
  const tables: AdminTable[] = [];
  for (let i = 1; i <= 12; i++) tables.push({ id: id(), zone_id: hall.id, name: String(i), sort: i, is_active: true });
  for (let i = 1; i <= 8; i++) tables.push({ id: id(), zone_id: street.id, name: `У${i}`, sort: i, is_active: true });

  const printers: AdminPrinter[] = [];
  const printer = (name: string, ip: string) => {
    const p: AdminPrinter = { id: id(), name, ip, port: 9100, codepage: 'cp866', codepage_id: 17, width: 80, emulate: true, is_active: true };
    printers.push(p);
    return p.id;
  };
  const cashPrinter = printer('Касса', '192.168.1.50');

  const stations: AdminStation[] = [];
  const station = (name: string, ip: string) => {
    const s: AdminStation = { id: id(), name, printer_id: printer(name, ip), is_active: true };
    stations.push(s);
    return s.id;
  };
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
  const categories: AdminCategory[] = [];
  const products: AdminProduct[] = [];
  menu.forEach(([name, station_id, items], ci) => {
    const category: AdminCategory = { id: id(), name, station_id, sort: ci + 1, is_active: true };
    categories.push(category);
    items.forEach(([pname, price], pi) => {
      products.push({ id: id(), category_id: category.id, name: pname, price, station_id: null, sort: pi + 1, is_active: true });
    });
  });

  return {
    version: MOCK_DB_VERSION,
    seq,
    users,
    sessions: [],
    zones: [hall, street],
    tables,
    printers,
    stations,
    categories,
    products,
    orders: [],
    items: [],
    rounds: [],
    print_jobs: [],
    settings: {
      cafe_name: 'Xazora City',
      currency: 'сум',
      receipt_printer_id: cashPrinter,
      receipt_header: '',
      receipt_footer: 'Спасибо! Ждём вас снова!',
      waiter_can_use_foreign_tables: true,
    },
    next_receipt_no: 1,
  };
}
