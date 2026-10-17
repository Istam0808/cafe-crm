// Data shapes exchanged with the backend. This file is the API contract (see PROJECT.md §6).

export type Role = 'admin' | 'cashier' | 'waiter';

export interface User {
  id: number;
  name: string;
  role: Role;
}

export interface Zone {
  id: number;
  name: string;
  service_percent: number;
}

export interface FloorTable {
  id: number;
  zone_id: number;
  name: string;
  order: {
    id: number;
    total: number;
    waiter_id: number;
    waiter_name: string;
    opened_at: string;
    items_count: number;
  } | null;
}

export interface Floor {
  zones: Zone[];
  tables: FloorTable[];
}

export interface Category {
  id: number;
  name: string;
  station_id: number | null;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  price: number;
}

export interface Menu {
  categories: Category[];
  products: Product[];
}

export type OrderStatus = 'open' | 'paid' | 'cancelled';

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  price: number;
  qty: number;
  station_id: number | null;
  station_name: string | null;
  round: number;
  comment: string;
  status: 'active' | 'cancelled';
  added_by_name: string;
  added_at: string;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

export interface Order {
  id: number;
  table_id: number;
  table_label: string;
  waiter_id: number;
  waiter_name: string;
  cashier_name: string;
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
  receipt_no: number | null;
  void_reason: string | null;
  opened_at: string;
  closed_at: string | null;
  items: OrderItem[];
}

export interface ClosedOrder {
  id: number;
  receipt_no: number | null;
  status: OrderStatus;
  total: number;
  paid_cash: number;
  paid_card: number;
  opened_at: string;
  closed_at: string;
  void_reason: string | null;
  table_label: string;
  waiter_name: string;
  cashier_name: string;
}

export interface NewItem {
  product_id: number;
  qty: number;
  comment: string;
}

export interface DayReport {
  date: string;
  revenue: number;
  checks: number;
  avg_check: number;
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

export interface PrintJob {
  id: number;
  printer_id: number;
  printer_name: string;
  kind: 'kitchen' | 'cancel' | 'precheck' | 'receipt' | 'report' | 'test';
  title: string;
  status: 'pending' | 'done' | 'failed';
  error: string | null;
  preview: string;
  created_at: string;
}

// --- admin ---

export interface AdminZone { id: number; name: string; service_percent: number; sort: number; is_active: boolean }
export interface AdminTable { id: number; zone_id: number; name: string; sort: number; is_active: boolean }
export interface AdminPrinter {
  id: number;
  name: string;
  ip: string;
  port: number;
  codepage: 'cp866' | 'cp1251';
  codepage_id: number;
  width: 58 | 80;
  emulate: boolean;
  is_active: boolean;
}
export interface AdminStation { id: number; name: string; printer_id: number | null; is_active: boolean }
export interface AdminCategory { id: number; name: string; station_id: number | null; sort: number; is_active: boolean }
export interface AdminProduct {
  id: number;
  category_id: number;
  name: string;
  price: number;
  station_id: number | null;
  sort: number;
  is_active: boolean;
}
export interface AdminUser { id: number; name: string; role: Role; is_active: boolean; pin?: string }

export interface AdminResources {
  zones: AdminZone;
  tables: AdminTable;
  printers: AdminPrinter;
  stations: AdminStation;
  categories: AdminCategory;
  products: AdminProduct;
  users: AdminUser;
}
export type AdminResource = keyof AdminResources;

export interface Settings {
  cafe_name: string;
  currency: string;
  receipt_printer_id: number | null;
  receipt_header: string;
  receipt_footer: string;
  waiter_can_use_foreign_tables: boolean;
}

export type RealtimeEvent =
  | { type: 'floor' }
  | { type: 'order'; order_id: number }
  | { type: 'print'; job_id: number; status: PrintJob['status']; printer: string; error?: string };
