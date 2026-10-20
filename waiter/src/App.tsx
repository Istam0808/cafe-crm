import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@shared/auth';
import { Toaster } from '@shared/components/Toast';
import { Login } from '@shared/pages/Login';
import type { Role } from '@shared/types';
import { WaiterApp } from './WaiterApp';

// the cashier and the admin may take orders from a phone too
const APP_ROLES: Role[] = ['waiter', 'cashier', 'admin'];

function Guard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider roles={APP_ROLES}>
      {/* hash routing: works from a plain static folder, from the backend and inside the Android app */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login home="/" />} />
          <Route path="/*" element={<Guard><WaiterApp /></Guard>} />
        </Routes>
      </HashRouter>
      <Toaster />
    </AuthProvider>
  );
}
