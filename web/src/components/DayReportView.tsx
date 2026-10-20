import { useState } from 'react';
import { api } from '@shared/api';
import { hhmm, money, today } from '@shared/format';
import { useLoad } from '@shared/hooks';
import { useRealtime } from '@shared/realtime';
import { toast, toastError } from '@shared/components/Toast';

export function DayReportView() {
  const [date, setDate] = useState(today());
  const report = useLoad(() => api.dayReport(date), [date]);
  useRealtime((e) => {
    if (e.type === 'floor' && date === today()) void report.reload();
  });
  const r = report.data;

  async function print() {
    try {
      await api.printDayReport(date);
      toast('X-отчёт отправлен на печать', 'success');
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="report">
      <div className="toolbar">
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="btn" onClick={() => void print()}>Печать X-отчёта</button>
      </div>
      {!r ? (
        <p className="muted pad">Загрузка…</p>
      ) : (
        <>
          <div className="stats">
            <Stat label="Выручка" value={money(r.revenue)} accent />
            <Stat label="Чеков" value={String(r.checks)} />
            <Stat label="Средний чек" value={money(r.avg_check)} />
            <Stat label="Наличные" value={money(r.cash)} />
            <Stat label="Карта" value={money(r.card)} />
            <Stat label="Обслуживание" value={money(r.service)} />
            <Stat label="Скидки" value={money(r.discount)} />
          </div>

          <div className="report-grid">
            <ReportTable title="По блюдам" rows={r.products.map((p) => [p.name, String(p.qty), money(p.sum)])} head={['Блюдо', 'Кол-во', 'Сумма']} />
            <div>
              <ReportTable title="По категориям" rows={r.categories.map((c) => [c.name, String(c.qty), money(c.sum)])} head={['Категория', 'Кол-во', 'Сумма']} />
              <ReportTable title="По официантам" rows={r.waiters.map((w) => [w.name, String(w.checks), money(w.sum)])} head={['Официант', 'Чеков', 'Сумма']} />
              {r.open.length > 0 && (
                <ReportTable title="Ещё не оплачено" num={1} rows={r.open.map((o) => [o.table, o.waiter, money(o.total)])} head={['Стол', 'Официант', 'Сумма']} />
              )}
            </div>
          </div>
          {r.cancelled.length > 0 && (
            <ReportTable
              title="Отмены"
              head={['Время', 'Блюдо', 'Кто', 'Причина', 'Кол-во', 'Сумма']}
              rows={r.cancelled.map((c) => [hhmm(c.time), c.name, c.by, c.reason, String(c.qty), money(c.sum)])}
            />
          )}
          <p className="muted small">Суммы по блюдам и категориям указаны по ценам меню, без обслуживания и скидок.</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'stat-accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** The last numeric columns are right-aligned: `num` is how many columns from the end. */
function ReportTable({ title, head, rows, num = 2 }: { title: string; head: string[]; rows: string[][]; num?: number }) {
  const isNum = (i: number) => i >= head.length - num;
  return (
    <section className="card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">Нет данных</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>{head.map((h, i) => <th key={h} className={isNum(i) ? 'num' : ''}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>{row.map((cell, ci) => <td key={ci} className={isNum(ci) ? 'num' : ''}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
