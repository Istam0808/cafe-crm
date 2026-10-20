import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isDemo } from '@shared/api';
import { resetDemo } from '@shared/api/mock';
import { DayReportView } from '../components/DayReportView';
import { toast, toastError } from '@shared/components/Toast';
import { TopBar } from '@shared/components/TopBar';
import { ROLE_LABEL } from '@shared/format';
import { useLoad } from '@shared/hooks';
import type { AdminResource, AdminResources, Settings } from '@shared/types';
import { CrudTable } from './CrudTable';

type Tab = 'menu' | 'floor' | 'printers' | 'users' | 'settings' | 'report';

const TABS: [Tab, string][] = [
  ['menu', 'Меню'],
  ['floor', 'Зоны и столы'],
  ['printers', 'Принтеры и цеха'],
  ['users', 'Сотрудники'],
  ['settings', 'Настройки'],
  ['report', 'Отчёт'],
];

function useResource<R extends AdminResource>(resource: R) {
  return useLoad<AdminResources[R][]>(() => api.adminList(resource), []);
}

export function AdminApp() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('menu');
  const zones = useResource('zones');
  const tables = useResource('tables');
  const printers = useResource('printers');
  const stations = useResource('stations');
  const categories = useResource('categories');
  const products = useResource('products');
  const users = useResource('users');

  const none = { value: null, label: '— не печатать —' };
  const stationOptions = [none, ...(stations.data ?? []).filter((s) => s.is_active).map((s) => ({ value: s.id, label: s.name }))];
  const printerOptions = [{ value: null, label: '— нет —' }, ...(printers.data ?? []).filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }))];
  const zoneOptions = (zones.data ?? []).map((z) => ({ value: z.id, label: z.name }));
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="screen admin">
      <TopBar title="Админка" back="/cashier" />
      <nav className="tabs main-tabs">
        {TABS.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
        <button className="btn btn-ghost tabs-info" onClick={() => navigate('/cashier')}>← Касса</button>
      </nav>

      <div className="page">
        {tab === 'menu' && (
          <>
            <p className="muted">
              Цех определяет, на какой принтер уходит блюдо. У блюда можно указать свой цех, иначе берётся цех категории.
            </p>
            <CrudTable
              title="Категории"
              resource="categories"
              rows={categories.data ?? []}
              onChanged={() => void categories.reload()}
              defaults={{ name: '', station_id: null, sort: (categories.data?.length ?? 0) + 1, is_active: true }}
              fields={[
                { key: 'name', label: 'Название', type: 'text' },
                { key: 'station_id', label: 'Цех', type: 'select', options: stationOptions },
                { key: 'sort', label: 'Порядок', type: 'number' },
              ]}
            />
            <CrudTable
              title="Блюда"
              resource="products"
              rows={products.data ?? []}
              onChanged={() => void products.reload()}
              defaults={{ name: '', price: 0, category_id: categoryOptions[0]?.value, station_id: null, sort: 0, is_active: true }}
              fields={[
                { key: 'name', label: 'Название', type: 'text' },
                { key: 'category_id', label: 'Категория', type: 'select', options: categoryOptions },
                { key: 'price', label: 'Цена', type: 'money' },
                { key: 'station_id', label: 'Свой цех', type: 'select', options: [{ value: null, label: 'как у категории' }, ...stationOptions.slice(1)] },
                { key: 'sort', label: 'Порядок', type: 'number', formOnly: true },
              ]}
            />
          </>
        )}

        {tab === 'floor' && (
          <>
            <CrudTable
              title="Зоны"
              resource="zones"
              rows={zones.data ?? []}
              onChanged={() => void zones.reload()}
              defaults={{ name: '', service_percent: 0, sort: (zones.data?.length ?? 0) + 1, is_active: true }}
              fields={[
                { key: 'name', label: 'Название', type: 'text' },
                { key: 'service_percent', label: 'Обслуживание, %', type: 'number' },
                { key: 'sort', label: 'Порядок', type: 'number' },
              ]}
            />
            <CrudTable
              title="Столы"
              resource="tables"
              rows={tables.data ?? []}
              onChanged={() => void tables.reload()}
              defaults={{ name: '', zone_id: zoneOptions[0]?.value, sort: (tables.data?.length ?? 0) + 1, is_active: true }}
              fields={[
                { key: 'name', label: 'Номер / название', type: 'text' },
                { key: 'zone_id', label: 'Зона', type: 'select', options: zoneOptions },
                { key: 'sort', label: 'Порядок', type: 'number' },
              ]}
            />
          </>
        )}

        {tab === 'printers' && (
          <>
            <CrudTable
              title="Цеха"
              resource="stations"
              rows={stations.data ?? []}
              onChanged={() => void stations.reload()}
              defaults={{ name: '', printer_id: null, is_active: true }}
              fields={[
                { key: 'name', label: 'Название', type: 'text' },
                { key: 'printer_id', label: 'Принтер', type: 'select', options: printerOptions },
              ]}
            />
            <CrudTable
              title="Принтеры"
              resource="printers"
              rows={printers.data ?? []}
              onChanged={() => void printers.reload()}
              defaults={{ name: '', ip: '192.168.1.', port: 9100, codepage: 'cp866', codepage_id: 17, width: 80, emulate: isDemo, is_active: true }}
              rowActions={(p) => (
                <button className="btn btn-sm" onClick={() => api.testPrinter(p.id).then(() => toast('Тест отправлен', 'success'), toastError)}>Тест</button>
              )}
              fields={[
                { key: 'name', label: 'Название', type: 'text' },
                { key: 'ip', label: 'IP', type: 'text' },
                { key: 'port', label: 'Порт', type: 'number' },
                { key: 'width', label: 'Ширина', type: 'select', options: [{ value: 80, label: '80 мм' }, { value: 58, label: '58 мм' }] },
                { key: 'codepage', label: 'Кодировка', type: 'select', options: [{ value: 'cp866', label: 'CP866' }, { value: 'cp1251', label: 'Windows-1251' }] },
                { key: 'codepage_id', label: 'Номер кодовой страницы', type: 'number', formOnly: true, hint: 'Xprinter: CP866 = 17, Windows-1251 = 46. Смотрите тестовую страницу принтера.' },
                { key: 'emulate', label: 'Эмуляция', type: 'bool', hint: 'не печатать на бумагу, только показывать на кассе' },
              ]}
            />
          </>
        )}

        {tab === 'users' && (
          <CrudTable
            title="Сотрудники"
            resource="users"
            rows={users.data ?? []}
            onChanged={() => void users.reload()}
            defaults={{ name: '', role: 'waiter', pin: '', is_active: true }}
            fields={[
              { key: 'name', label: 'Имя', type: 'text' },
              { key: 'role', label: 'Роль', type: 'select', options: (['waiter', 'cashier', 'admin'] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] })) },
              { key: 'pin', label: 'PIN', type: 'pin', formOnly: true },
            ]}
          />
        )}

        {tab === 'settings' && <SettingsForm printers={printerOptions} />}
        {tab === 'report' && <DayReportView />}
      </div>
    </div>
  );
}

function SettingsForm({ printers }: { printers: { value: number | null; label: string }[] }) {
  const loaded = useLoad(() => api.settings(), []);
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => {
    if (loaded.data) setForm(loaded.data);
  }, [loaded.data]);

  if (!form) return <p className="muted">Загрузка…</p>;
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm({ ...form, [key]: value });

  async function save() {
    try {
      setForm(await api.saveSettings(form!));
      toast('Настройки сохранены', 'success');
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <section className="card narrow">
      <h3>Настройки</h3>
      <label className="field"><span>Название заведения (на чеке)</span><input value={form.cafe_name} onChange={(e) => set('cafe_name', e.target.value)} /></label>
      <label className="field"><span>Валюта</span><input value={form.currency} onChange={(e) => set('currency', e.target.value)} /></label>
      <label className="field">
        <span>Принтер чеков (касса)</span>
        <select value={form.receipt_printer_id ?? ''} onChange={(e) => set('receipt_printer_id', e.target.value ? Number(e.target.value) : null)}>
          {printers.map((p) => <option key={String(p.value)} value={p.value ?? ''}>{p.label}</option>)}
        </select>
      </label>
      <label className="field"><span>Шапка чека (адрес, телефон)</span><textarea rows={2} value={form.receipt_header} onChange={(e) => set('receipt_header', e.target.value)} /></label>
      <label className="field"><span>Подвал чека</span><textarea rows={2} value={form.receipt_footer} onChange={(e) => set('receipt_footer', e.target.value)} /></label>
      <label className="check">
        <input type="checkbox" checked={form.waiter_can_use_foreign_tables} onChange={(e) => set('waiter_can_use_foreign_tables', e.target.checked)} />
        Официант может добавлять в стол другого официанта
      </label>
      <div className="row-end">
        <button className="btn btn-primary" onClick={() => void save()}>Сохранить</button>
      </div>

      {isDemo && (
        <div className="danger-zone">
          <h3>Демо-режим</h3>
          <p className="muted small">Все данные хранятся в этом браузере. Сброс вернёт демо-меню и удалит все заказы.</p>
          <button className="btn btn-danger" onClick={() => { if (confirm('Удалить все демо-данные и начать заново?')) { resetDemo(); window.location.reload(); } }}>
            Сбросить демо-данные
          </button>
        </div>
      )}
    </section>
  );
}
