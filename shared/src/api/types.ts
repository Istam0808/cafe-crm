import type {
  AdminResource, AdminResources, ClosedOrder, DayReport, Floor, Menu, NewItem, Order, PrintJob, Settings, User,
} from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Everything the UI needs from a backend. Implemented by the Django client and by the demo mock. */
export interface Api {
  loginUsers(): Promise<User[]>;
  /** Without userId the employee is found by the PIN alone (PINs of active employees are unique). */
  login(pin: string, userId?: number): Promise<{ token: string; user: User }>;
  logout(): Promise<void>;

  menu(): Promise<Menu>;
  floor(): Promise<Floor>;

  order(id: number): Promise<Order>;
  sendRound(tableId: number, requestId: string, items: NewItem[]): Promise<Order>;
  cancelItem(orderId: number, itemId: number, qty: number, reason: string): Promise<Order>;
  updateOrder(orderId: number, changes: { service_percent?: number; discount?: number }): Promise<Order>;
  moveOrder(orderId: number, tableId: number): Promise<Order>;
  precheck(orderId: number): Promise<{ printed: boolean }>;
  pay(orderId: number, cash: number, card: number): Promise<{ order: Order; printed: boolean }>;
  voidOrder(orderId: number, reason: string): Promise<Order>;
  reprint(orderId: number): Promise<{ printed: boolean }>;
  closedOrders(date: string): Promise<ClosedOrder[]>;

  dayReport(date: string): Promise<DayReport>;
  printDayReport(date: string): Promise<{ printed: boolean }>;

  printJobs(): Promise<PrintJob[]>;
  retryPrintJob(id: number): Promise<PrintJob>;

  adminList<R extends AdminResource>(resource: R): Promise<AdminResources[R][]>;
  adminCreate<R extends AdminResource>(resource: R, data: Partial<AdminResources[R]>): Promise<AdminResources[R]>;
  adminUpdate<R extends AdminResource>(resource: R, id: number, data: Partial<AdminResources[R]>): Promise<AdminResources[R]>;
  settings(): Promise<Settings>;
  saveSettings(data: Settings): Promise<Settings>;
  testPrinter(id: number): Promise<void>;
}
