import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isDemo } from '../api';
import { useAuth } from '../auth';

interface Props {
  title: ReactNode;
  back?: string;
  children?: ReactNode;
}

export function TopBar({ title, back, children }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" onClick={() => navigate(back)} aria-label="Назад">←</button>
      )}
      <h1 className="topbar-title">{title}</h1>
      {isDemo && <span className="demo-badge">ДЕМО</span>}
      <div className="topbar-right">
        {children}
        <button className="btn btn-ghost" onClick={() => void logout()} title="Выйти">
          {user?.name} · Выйти
        </button>
      </div>
    </header>
  );
}
