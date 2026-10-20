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

export const MOCK_DB_VERSION = 4;

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

  // the real Xazora City menu from oddmenu.com/ru/p/xazora-city-1; photos live in
  // shared/public/menu (copied into both apps), see SOURCE.md there
  const photo = (name: string) => `menu/${name}.jpg`;
  // [name, price, photo, station override]
  type Item = [string, number, string, number?];
  const menu: [string, number | null, string, Item[]][] = [
    ['Завтраки', hot, 'breakfast', [
      ['Сет «Сладкий завтрак»', 40000, 'sweet-breakfast-set'], ['Манная каша', 15000, 'semolina'], ['Мёд', 10000, 'honey'],
      ['Сгущённое молоко', 10000, 'condensed-milk'], ['Сливки', 10000, 'cream'], ['Омлет', 35000, 'omelette'],
      ['Рисовая каша', 25000, 'rice-porridge'], ['Гренки', 15000, 'croutons'], ['Утренний заряд', 25000, 'morning-boost'],
    ]],
    ['Салаты', salad, 'fresh-salad', [
      ['Свежий', 20000, 'fresh-salad'], ['Мужской каприз', 35000, 'mens-caprice'], ['Цезарь', 30000, 'caesar'],
      ['Зелёный ассорти', 19000, 'green-assorti'], ['Оливье', 30000, 'olivier'], ['Соленье', 20000, 'pickles'],
      ['Французский', 30000, 'french-salad'], ['Свежий средний', 15000, 'fresh-salad-medium'], ['Чиракчи', 25000, 'chirakchi'],
      ['Анзур', 15000, 'anzur'], ['Греческий', 27000, 'greek-salad'], ['Мажнунтол', 25000, 'majnuntol'],
      ['Морковный салат', 13000, 'carrot-salad'], ['Чака', 10000, 'chaka'], ['Универсальный салат', 10000, 'universal-salad'],
    ]],
    ['Первые блюда', hot, 'lagman', [
      ['Илик шурбо', 38000, 'ilik-shurbo'], ['Уноши', 25000, 'unoshi'], ['Лагман', 40000, 'lagman'], ['Мастава', 25000, 'mastava'],
    ]],
    ['Вторые блюда', hot, 'plov', [
      ['Казан кебаб', 58000, 'kazan-kebab'], ['Лагман жареный', 45000, 'fried-lagman'], ['Голубцы', 35000, 'golubtsy'],
      ['Туй кебаб', 53000, 'tuy-kebab'], ['Бифштекс', 45000, 'beefsteak'], ['Пельмени', 35000, 'pelmeni'],
      ['Манты', 8000, 'manti'], ['Плов', 60000, 'plov'], ['Кувват-плов', 99000, 'kuvvat-plov'], ['Самса', 10000, 'samsa'],
    ]],
    ['Шашлыки', hot, 'shashlik-assorti', [
      ['Шашлык молотый', 30000, 'shashlik-minced'], ['Шашлык кусковой говядины', 33000, 'shashlik-beef'],
      ['Шашлык кусковой баранины', 33000, 'shashlik-lamb'], ['Шашлык Наполеон', 33000, 'shashlik-napoleon'],
      ['Шашлык рулет', 33000, 'shashlik-roll'], ['Шашлык вырезка', 45000, 'shashlik-tenderloin'],
      ['Шашлык бикин', 40000, 'shashlik-bikin'], ['Шашлык корейка', 50000, 'shashlik-rack'],
      ['Котлета с сыром', 30000, 'shashlik-cheese-cutlet'], ['Шашлык рыба', 30000, 'shashlik-fish'],
      ['Шашлык крылышки', 28000, 'shashlik-wings'], ['Акараска', 30000, 'shashlik-akaraska'],
      ['Шашлык печень', 28000, 'shashlik-liver'], ['Шашлык думба', 28000, 'shashlik-dumba'],
      ['Ассорти шашлыков', 165000, 'shashlik-assorti'], ['Мясное ассорти', 285000, 'meat-assorti'],
    ]],
    ['Гарниры', hot, 'fries', [['Картофель фри', 15000, 'fries']]],
    ['Хлеб', null, 'non', [['Хлеб', 6000, 'non']]],
    ['Хот-доги', fastfood, 'hotdog', [
      ['Канадский хот-дог, 2 сосиски', 20000, 'hotdog'], ['Канадский хот-дог, 3 сосиски', 25000, 'hotdog'],
    ]],
    ['Лаваш', fastfood, 'lavash-category', [
      ['Лаваш', 40000, 'lavash'], ['Лаваш большой', 45000, 'lavash-big'], ['Лаваш большой с сыром', 48000, 'lavash-big-cheese'],
    ]],
    ['Шаурма', fastfood, 'shawarma', [['Шаурма пита', 40000, 'shawarma'], ['Шаурма пита большая', 45000, 'shawarma']]],
    ['Бургеры', fastfood, 'burger', [
      ['Классик бургер', 45000, 'burger'], ['Чизбургер', 48000, 'cheeseburger'],
      ['Дабл бургер', 60000, 'double-burger'], ['Дабл чизбургер', 65000, 'double-cheeseburger'],
    ]],
    ['Чикен', fastfood, 'chicken-wings', [
      ['Чикен крылышки', 80000, 'chicken-wings'], ['Чикен голень', 80000, 'chicken-drumsticks'],
      ['Чикен филе', 80000, 'chicken-fillet'], ['Фри', 15000, 'chicken-fries'],
    ]],
    ['Чай', bar, 'black-tea', [['Чёрный чай', 5000, 'black-tea'], ['Зелёный чай', 5000, 'green-tea'], ['Чай с лимоном', 15000, 'lemon-tea']]],
    ['Кофе', bar, 'coffee', [['Кофе Савой', 10000, 'coffee'], ['Кофе 3 в 1', 7000, 'coffee']]],
    ['Напитки', null, 'drinks', [
      ['Coca-Cola 1 л', 15000, 'drinks'], ['Coca-Cola 0.5', 8000, 'drinks'], ['Pepsi 1 л', 15000, 'drinks'], ['Pepsi 0.5', 8000, 'drinks'],
      ['Fanta 1 л', 15000, 'drinks'], ['Fanta 0.5', 8000, 'drinks'], ['Сочная долина', 15000, 'drinks'], ['Динай', 15000, 'drinks'],
      ['Chortoq', 15000, 'drinks'], ['Вода', 5000, 'drinks'], ['Газированная вода', 5000, 'drinks'], ['Мохито', 15000, 'drinks', bar],
    ]],
  ];
  const categories: AdminCategory[] = [];
  const products: AdminProduct[] = [];
  menu.forEach(([name, station_id, image, items], ci) => {
    const category: AdminCategory = { id: id(), name, station_id, image: photo(image), sort: ci + 1, is_active: true };
    categories.push(category);
    items.forEach(([pname, price, pimage, pstation], pi) => {
      products.push({ id: id(), category_id: category.id, name: pname, price, station_id: pstation ?? null, image: photo(pimage), sort: pi + 1, is_active: true });
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
