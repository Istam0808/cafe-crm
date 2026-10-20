import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { API_URL, isDemo, saveServerUrl } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { PinPad } from '../components/PinPad';
import { toastError } from '../components/Toast';
import type { Role } from '../types';

const DEMO_PINS: { name: string; role: Role; pin: string }[] = [
  { name: 'Админ', role: 'admin', pin: '0000' },
  { name: 'Али', role: 'waiter', pin: '1234' },
  { name: 'Азиз', role: 'waiter', pin: '4321' },
];

/** Just a PIN pad: the employee is found by the PIN. After login goes to `home`. */
export function Login({ home }: { home: string }) {
  const { user, roles, login } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        await login(pin);
        navigate(home, { replace: true });
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(false);
      }
    },
    [login, navigate, home],
  );

  if (user) return <Navigate to={home} replace />;

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

      <div className="login-pin">
        <h2 className="login-title">Введите PIN</h2>
        <PinPad onSubmit={submit} busy={busy} />
        {isDemo && (
          <p className="muted center small">PIN в демо: {DEMO_PINS.filter((p) => roles.includes(p.role)).map((p) => `${p.name} ${p.pin}`).join(' · ')}</p>
        )}
      </div>

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
