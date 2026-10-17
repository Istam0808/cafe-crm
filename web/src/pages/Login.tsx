import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, API_URL, isDemo, saveServerUrl } from '../api';
import { homePath, useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PinPad } from '../components/PinPad';
import { toastError } from '../components/Toast';
import { ROLE_LABEL } from '../format';
import { useLoad } from '../hooks';
import type { User } from '../types';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const users = useLoad(() => api.loginUsers(), []);
  const [selected, setSelected] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  const submit = useCallback(
    async (pin: string) => {
      if (!selected) return;
      setBusy(true);
      try {
        const u = await login(selected.id, pin);
        navigate(homePath(u.role), { replace: true });
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(false);
      }
    },
    [selected, login, navigate],
  );

  if (user) return <Navigate to={homePath(user.role)} replace />;

  return (
    <div className="login">
      <header className="login-head">
        <div className="brand">
          <span className="brand-mark">X</span>
          <div>
            <h1>Xazora City</h1>
            <p className="muted">{isDemo ? 'Демо-режим: данные хранятся в этом браузере' : `Сервер: ${API_URL}`}</p>
          </div>
        </div>
        <button className="icon-btn" onClick={() => setServerOpen(true)} aria-label="Адрес сервера">⚙</button>
      </header>

      {!selected ? (
        <>
          <h2 className="login-title">Кто входит?</h2>
          <div className="user-grid">
            {users.data?.map((u) => (
              <button key={u.id} className={`user-tile role-${u.role}`} onClick={() => setSelected(u)}>
                <span className="avatar">{u.name.slice(0, 1)}</span>
                <span className="user-name">{u.name}</span>
                <span className="muted">{ROLE_LABEL[u.role]}</span>
              </button>
            ))}
            {users.loading && !users.data && <p className="muted">Загрузка…</p>}
            {!users.loading && !users.data && (
              <button className="btn" onClick={() => void users.reload()}>Повторить</button>
            )}
          </div>
          {isDemo && (
            <p className="muted center small">PIN в демо: Админ 0000 · Кассир 1111 · Али 1234 · Азиз 4321</p>
          )}
        </>
      ) : (
        <div className="login-pin">
          <button className="btn btn-ghost" onClick={() => setSelected(null)}>← {selected.name}</button>
          <h2 className="login-title">Введите PIN</h2>
          <PinPad onSubmit={submit} busy={busy} />
        </div>
      )}

      {serverOpen && <ServerDialog onClose={() => setServerOpen(false)} />}
    </div>
  );
}

function ServerDialog({ onClose }: { onClose(): void }) {
  const [url, setUrl] = useState(API_URL);
  const apply = (value: string) => {
    saveServerUrl(value.trim());
    window.location.reload();
  };
  return (
    <Modal
      title="Адрес сервера"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => apply('')}>Демо-режим</button>
          <button className="btn btn-primary" onClick={() => apply(url)} disabled={!/^https?:\/\/.+/.test(url.trim())}>Сохранить</button>
        </>
      }
    >
      <label className="field">
        <span>Адрес компьютера кассы</span>
        <input value={url} placeholder="http://192.168.1.10:8000" inputMode="url" onChange={(e) => setUrl(e.target.value)} />
      </label>
      <p className="muted small">Нужен для приложения официанта на Android. В браузере кассы обычно не меняется.</p>
    </Modal>
  );
}
