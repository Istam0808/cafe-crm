import { useState } from 'react';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { toastError } from '../components/Toast';
import { hhmm } from '../format';
import { useLoad } from '../hooks';
import { useRealtime } from '../realtime';
import type { PrintJob } from '../types';

const KIND_LABEL: Record<PrintJob['kind'], string> = {
  kitchen: 'Кухня',
  cancel: 'Отмена',
  precheck: 'Пречек',
  receipt: 'Чек',
  report: 'Отчёт',
  test: 'Тест',
};

const STATUS_LABEL: Record<PrintJob['status'], string> = { pending: 'в очереди', done: 'напечатано', failed: 'ошибка' };

/** What went to which printer — in demo mode this is where the "printed" tickets can be seen. */
export function PrintLog() {
  const jobs = useLoad(() => api.printJobs(), []);
  const [preview, setPreview] = useState<PrintJob | null>(null);
  const [printer, setPrinter] = useState('');
  useRealtime((e) => {
    if (e.type === 'print') void jobs.reload();
  });

  const printers = [...new Set(jobs.data?.map((j) => j.printer_name))];
  const visible = jobs.data?.filter((j) => !printer || j.printer_name === printer) ?? [];

  async function retry(job: PrintJob) {
    try {
      await api.retryPrintJob(job.id);
      void jobs.reload();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <div className="print-log">
      <div className="chips">
        <button className={`chip ${printer === '' ? 'active' : ''}`} onClick={() => setPrinter('')}>Все принтеры</button>
        {printers.map((p) => (
          <button key={p} className={`chip ${printer === p ? 'active' : ''}`} onClick={() => setPrinter(p)}>{p}</button>
        ))}
      </div>
      <div className="ticket-wall">
        {visible.map((j) => (
          <article key={j.id} className={`ticket ticket-${j.status}`}>
            <header>
              <span>{hhmm(j.created_at)} · {j.printer_name}</span>
              <span className={`tag tag-${j.kind}`}>{KIND_LABEL[j.kind]}</span>
            </header>
            <pre onClick={() => setPreview(j)}>{j.preview}</pre>
            <footer>
              <span className={`status status-${j.status}`}>{STATUS_LABEL[j.status]}</span>
              {j.status === 'failed' && (
                <>
                  <span className="muted small grow">{j.error}</span>
                  <button className="btn btn-sm" onClick={() => void retry(j)}>Повторить</button>
                </>
              )}
            </footer>
          </article>
        ))}
        {visible.length === 0 && <p className="muted pad">Печати ещё не было</p>}
      </div>
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <pre className="ticket-preview">{preview.preview}</pre>
        </Modal>
      )}
    </div>
  );
}
