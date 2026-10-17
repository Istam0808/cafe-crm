import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { Modal } from '../components/Modal';
import { toast, toastError } from '../components/Toast';
import { money } from '../format';
import type { AdminResource, AdminResources } from '../types';

export type FieldDef<T> = {
  key: keyof T & string;
  label: string;
  type: 'text' | 'number' | 'money' | 'select' | 'bool' | 'pin';
  options?: { value: string | number | null; label: string }[];
  /** hide in the list, show only in the form */
  formOnly?: boolean;
  hint?: string;
};

interface Props<R extends AdminResource> {
  title: string;
  resource: R;
  rows: AdminResources[R][];
  fields: FieldDef<AdminResources[R]>[];
  defaults: Partial<AdminResources[R]>;
  onChanged(): void;
  /** extra buttons per row, e.g. "Тест" for printers */
  rowActions?: (row: AdminResources[R]) => ReactNode;
}

type Row = { id: number; is_active: boolean } & Record<string, unknown>;

export function CrudTable<R extends AdminResource>({ title, resource, rows, fields, defaults, onChanged, rowActions }: Props<R>) {
  const [editing, setEditing] = useState<Partial<AdminResources[R]> | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const visible = (rows as unknown as Row[]).filter((r) => showInactive || r.is_active);

  const display = (f: FieldDef<AdminResources[R]>, row: Row) => {
    const v = row[f.key];
    if (f.type === 'select') return f.options?.find((o) => o.value === v)?.label ?? '—';
    if (f.type === 'bool') return v ? '✔' : '—';
    if (f.type === 'money') return money(Number(v));
    return String(v ?? '');
  };

  async function toggle(row: Row) {
    try {
      await api.adminUpdate(resource, row.id, { is_active: !row.is_active } as Partial<AdminResources[R]>);
      onChanged();
    } catch (err) {
      toastError(err);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <label className="check small">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> показать отключённые
        </label>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ ...defaults })}>+ Добавить</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            {fields.filter((f) => !f.formOnly).map((f) => (
              <th key={f.key} className={f.type === 'money' || f.type === 'number' ? 'num' : ''}>{f.label}</th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className={row.is_active ? '' : 'row-cancelled'}>
              {fields.filter((f) => !f.formOnly).map((f) => (
                <td key={f.key} className={f.type === 'money' || f.type === 'number' ? 'num' : ''}>{display(f, row)}</td>
              ))}
              <td className="row-actions">
                {rowActions?.(row as unknown as AdminResources[R])}
                <button className="btn btn-sm" onClick={() => setEditing({ ...(row as unknown as AdminResources[R]) })}>Изменить</button>
                <button className="btn btn-sm btn-ghost" onClick={() => void toggle(row)}>{row.is_active ? 'Отключить' : 'Включить'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 && <p className="muted">Пусто</p>}
      {editing && (
        <EditDialog
          resource={resource}
          fields={fields}
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); toast('Сохранено', 'success'); }}
        />
      )}
    </section>
  );
}

function EditDialog<R extends AdminResource>({ resource, fields, value, onClose, onSaved }: {
  resource: R;
  fields: FieldDef<AdminResources[R]>[];
  value: Partial<AdminResources[R]>;
  onClose(): void;
  onSaved(): void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(value as Record<string, unknown>);
  const [busy, setBusy] = useState(false);
  const id = form.id as number | undefined;
  const set = (key: string, v: unknown) => setForm((f) => ({ ...f, [key]: v }));

  async function save() {
    setBusy(true);
    try {
      const data = { ...form } as Record<string, unknown>;
      delete data.id;
      if (id) await api.adminUpdate(resource, id, data as Partial<AdminResources[R]>);
      else await api.adminCreate(resource, data as Partial<AdminResources[R]>);
      onSaved();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={id ? 'Изменить' : 'Добавить'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Сохранить</button>
        </>
      }
    >
      {fields.map((f) => {
        const v = form[f.key];
        if (f.type === 'bool') {
          return (
            <label key={f.key} className="check">
              <input type="checkbox" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}
              {f.hint && <span className="muted small"> — {f.hint}</span>}
            </label>
          );
        }
        return (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            {f.type === 'select' ? (
              <select value={v === null || v === undefined ? '' : String(v)} onChange={(e) => {
                const opt = f.options?.find((o) => String(o.value ?? '') === e.target.value);
                set(f.key, opt ? opt.value : null);
              }}>
                {f.options?.map((o) => <option key={String(o.value)} value={o.value === null ? '' : String(o.value)}>{o.label}</option>)}
              </select>
            ) : f.type === 'pin' ? (
              <input
                inputMode="numeric"
                maxLength={4}
                placeholder={id ? 'оставьте пустым, чтобы не менять' : '4 цифры'}
                value={String(v ?? '')}
                onChange={(e) => set(f.key, e.target.value.replace(/\D/g, ''))}
              />
            ) : f.type === 'text' ? (
              <input value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input inputMode="decimal" value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
            )}
            {f.hint && <span className="muted small">{f.hint}</span>}
          </label>
        );
      })}
    </Modal>
  );
}
