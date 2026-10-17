import { ApiError, type Api } from './types';
import { getToken } from './token';

/** Client for the Django REST backend (contract: PROJECT.md §6). */
export function createHttpApi(baseUrl: string): Api {
  const root = baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = getToken();
    if (token) headers.Authorization = `Token ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(`${root}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'Нет связи с сервером. Проверьте Wi-Fi.');
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      // DRF puts the message in "detail"; field errors come as {field: ["..."]}
      const detail = data?.detail ?? (data && typeof data === 'object' ? Object.values(data).flat().join(' ') : '');
      throw new ApiError(res.status, detail || `Ошибка сервера (${res.status})`);
    }
    return data as T;
  }

  const get = <T>(path: string) => request<T>('GET', path);
  const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);

  return {
    loginUsers: () => get('/auth/users/'),
    login: (userId, pin) => post('/auth/login/', { user_id: userId, pin }),
    logout: async () => {
      await post('/auth/logout/');
    },

    menu: () => get('/menu/'),
    floor: () => get('/floor/'),

    order: (id) => get(`/orders/${id}/`),
    sendRound: (tableId, requestId, items) => post(`/tables/${tableId}/rounds/`, { request_id: requestId, items }),
    cancelItem: (orderId, itemId, qty, reason) => post(`/orders/${orderId}/items/${itemId}/cancel/`, { qty, reason }),
    updateOrder: (orderId, changes) => request('PATCH', `/orders/${orderId}/`, changes),
    moveOrder: (orderId, tableId) => post(`/orders/${orderId}/move/`, { table_id: tableId }),
    precheck: (orderId) => post(`/orders/${orderId}/precheck/`),
    pay: (orderId, cash, card) => post(`/orders/${orderId}/pay/`, { cash, card }),
    voidOrder: (orderId, reason) => post(`/orders/${orderId}/void/`, { reason }),
    reprint: (orderId) => post(`/orders/${orderId}/reprint/`),
    closedOrders: (date) => get(`/orders/?date=${date}`),

    dayReport: (date) => get(`/reports/day/?date=${date}`),
    printDayReport: (date) => post('/reports/day/print/', { date }),

    printJobs: () => get('/print-jobs/'),
    retryPrintJob: (id) => post(`/print-jobs/${id}/retry/`),

    adminList: (resource) => get(`/admin/${resource}/`),
    adminCreate: (resource, data) => post(`/admin/${resource}/`, data),
    adminUpdate: (resource, id, data) => request('PATCH', `/admin/${resource}/${id}/`, data),
    settings: () => get('/admin/settings/'),
    saveSettings: (data) => request('PUT', '/admin/settings/', data),
    testPrinter: async (id) => {
      await post(`/admin/printers/${id}/test/`);
    },
  };
}
