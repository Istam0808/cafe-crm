import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { DayReportView } from '../components/DayReportView';
import { TableGrid } from '../components/TableGrid';
import { toast } from '../components/Toast';
import { TopBar } from '../components/TopBar';
import { money } from '../format';
import { useFloor } from '../hooks';
import { useRealtime } from '../realtime';
import { History } from './History';
import { OrderPanel } from './OrderPanel';
import { PrintLog } from './PrintLog';

type Tab = 'tables' | 'history' | 'report' | 'print';

export function CashierApp() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: floor } = useFloor();
  const [tab, setTab] = useState<Tab>('tables');
  const [tableId, setTableId] = useState<number | null>(null);
  const [printErrors, setPrintErrors] = useState(0);

  useRealtime((e) => {
    if (e.type === 'print' && e.status === 'failed') {
      setPrintErrors((n) => n + 1);
      toast(`Принтер «${e.printer}»: ${e.error ?? 'ошибка печати'}`, 'error');
    }
  });

  const table = floor?.tables.find((t) => t.id === tableId) ?? null;
  const open = floor?.tables.filter((t) => t.order) ?? [];
  const openSum = open.reduce((s, t) => s + (t.order?.total ?? 0), 0);

  const tabs: [Tab, string][] = [
    ['tables', 'Столы'],
    ['history', 'История'],
    ['report', 'Отчёт за день'],
    ['print', printErrors ? `Печать ⚠ ${printErrors}` : 'Печать'],
  ];

  return (
    <div className="screen cashier">
      <TopBar title="Касса">
        {user?.role === 'admin' && <button className="btn btn-ghost" onClick={() => navigate('/admin')}>Админка</button>}
        <button className="btn btn-ghost" onClick={() => navigate('/waiter')}>Режим официанта</button>
      </TopBar>
      <nav className="tabs main-tabs">
        {tabs.map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); if (key === 'print') setPrintErrors(0); }}>
            {label}
          </button>
        ))}
        <span className="tabs-info muted">Открыто столов: {open.length} · {money(openSum)}</span>
      </nav>

      {tab === 'tables' && (
        <div className="cashier-layout">
          <div className="cashier-floor">
            {floor?.zones.map((z) => (
              <section key={z.id} className="zone-section">
                <h3>{z.name}</h3>
                <TableGrid tables={floor.tables.filter((t) => t.zone_id === z.id)} selectedId={tableId} onPick={(t) => setTableId(t.id)} />
              </section>
            ))}
          </div>
          <div className="cashier-order">
            {table && floor ? <OrderPanel key={table.id} table={table} floor={floor} /> : <p className="muted center pad">Выберите стол слева</p>}
          </div>
        </div>
      )}
      {tab === 'history' && <div className="page"><History /></div>}
      {tab === 'report' && <div className="page"><DayReportView /></div>}
      {tab === 'print' && <div className="page"><PrintLog /></div>}
    </div>
  );
}
