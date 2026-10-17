import { useState } from 'react';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { SentItems } from '../components/SentItems';
import { toast, toastError } from '../components/Toast';
import { hhmm, money, today } from '../format';
import { useLoad, useOrder } from '../hooks';
import { useRealtime } from '../realtime';

export function History() {
  const [date, setDate] = useState(today());
  const list = useLoad(() => api.closedOrders(date), [date]);
  const [openId, setOpenId] = useState<number | null>(null);
  useRealtime((e) => {
    if (e.type === 'floor' && date === today()) void list.reload();
  });

  return (
    <div className="history">
      <div className="toolbar">
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <span className="muted">{list.data?.length ?? 0} заказов</span>
      </div>
      <table className="data-table clickable">
        <thead>
          <tr>
            <th>Чек</th><th>Стол</th><th>Официант</th><th>Открыт</th><th>Закрыт</th><th className="num">Наличные</th><th className="num">Карта</th><th className="num">Итого</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((o) => (
            <tr key={o.id} onClick={() => setOpenId(o.id)} className={o.status === 'cancelled' ? 'row-cancelled' : ''}>
              <td>{o.status === 'paid' ? `№${o.receipt_no}` : 'аннулирован'}</td>
              <td>{o.table_label}</td>
              <td>{o.waiter_name}</td>
              <td>{hhmm(o.opened_at)}</td>
              <td>{hhmm(o.closed_at)}</td>
              <td className="num">{money(o.paid_cash)}</td>
              <td className="num">{money(o.paid_card)}</td>
              <td className="num"><b>{money(o.total)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="muted pad">За этот день закрытых заказов нет</p>}
      {openId && <ClosedOrderDialog orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function ClosedOrderDialog({ orderId, onClose }: { orderId: number; onClose(): void }) {
  const { data: order } = useOrder(orderId);

  async function reprint() {
    try {
      const r = await api.reprint(orderId);
      toast(r.printed ? 'Чек отправлен на печать' : 'Принтер кассы не выбран', r.printed ? 'success' : 'error');
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <Modal
      title={order ? (order.status === 'paid' ? `Чек №${order.receipt_no} · ${order.table_label}` : `Аннулирован · ${order.table_label}`) : 'Заказ'}
      onClose={onClose}
      wide
      footer={order?.status === 'paid' ? <button className="btn" onClick={() => void reprint()}>Перепечатать чек</button> : undefined}
    >
      {order && (
        <>
          <p className="muted">
            Официант {order.waiter_name} · кассир {order.cashier_name} · {order.opened_at.slice(11, 16)}–{hhmm(order.closed_at)}
            {order.void_reason && ` · причина: ${order.void_reason}`}
          </p>
          <SentItems order={order} />
          <div className="totals">
            <div className="row-between"><span>Сумма</span><span>{money(order.subtotal)}</span></div>
            {order.service_amount > 0 && <div className="row-between"><span>Обслуживание {order.service_percent}%</span><span>{money(order.service_amount)}</span></div>}
            {order.discount > 0 && <div className="row-between"><span>Скидка</span><span>−{money(order.discount)}</span></div>}
            <div className="row-between total-line"><span>ИТОГО</span><span>{money(order.total)}</span></div>
            {order.paid_cash > 0 && <div className="row-between muted"><span>Наличные</span><span>{money(order.paid_cash)}</span></div>}
            {order.paid_card > 0 && <div className="row-between muted"><span>Карта</span><span>{money(order.paid_card)}</span></div>}
          </div>
        </>
      )}
    </Modal>
  );
}
