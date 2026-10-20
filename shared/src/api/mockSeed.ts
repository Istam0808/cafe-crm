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

export const MOCK_DB_VERSION = 3;

export function seedDb(): MockDb {
  let seq = 0;
  const id = () => ++seq;

  const users: MockUser[] = [
    // one account for the cash desk and the admin panel
    { id: id(), name: 'Админ', role: 'admin', pin: '0000', is_active: true },
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

  // photos live in shared/public/menu (copied into both apps), see CREDITS.md there
  const photo = (name: string) => `menu/${name}.jpg`;
  const menu: [string, number | null, string, [string, number, string][]][] = [
    ['Горячие блюда', hot, 'plov', [['Плов', 35000, 'plov'], ['Лагман', 30000, 'lagman'], ['Шурпа', 28000, 'shurpa'], ['Манты (5 шт)', 30000, 'manti'], ['Казан-кабоб', 55000, 'kazan-kabob']]],
    ['Салаты', salad, 'caesar', [['Ачичук', 12000, 'achichuk'], ['Цезарь', 32000, 'caesar'], ['Оливье', 20000, 'olivier'], ['Овощной', 18000, 'vegetable-salad']]],
    ['Фаст-фуд', fastfood, 'burger', [['Бургер', 32000, 'burger'], ['Чизбургер', 36000, 'cheeseburger'], ['Хот-дог', 20000, 'hotdog'], ['Лаваш', 28000, 'lavash'], ['Картофель фри', 15000, 'fries']]],
    ['Напитки', bar, 'black-tea', [['Чай зелёный (чайник)', 8000, 'green-tea'], ['Чай чёрный (чайник)', 8000, 'black-tea'], ['Кофе американо', 15000, 'americano'], ['Компот', 8000, 'kompot']]],
    ['Холодильник', null, 'cola', [['Вода 0.5', 4000, 'water'], ['Coca-Cola 0.5', 9000, 'cola'], ['Сок 1 л', 18000, 'juice']]],
    ['Хлеб', null, 'non', [['Лепёшка', 5000, 'non']]],
  ];
  const categories: AdminCategory[] = [];
  const products: AdminProduct[] = [];
  menu.forEach(([name, station_id, image, items], ci) => {
    const category: AdminCategory = { id: id(), name, station_id, image: photo(image), sort: ci + 1, is_active: true };
    categories.push(category);
    items.forEach(([pname, price, pimage], pi) => {
      products.push({ id: id(), category_id: category.id, name: pname, price, station_id: null, image: photo(pimage), sort: pi + 1, is_active: true });
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
