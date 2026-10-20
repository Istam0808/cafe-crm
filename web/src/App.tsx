import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@shared/auth';
import { Toaster } from '@shared/components/Toast';
import { Login } from '@shared/pages/Login';
import type { Role } from '@shared/types';
import { AdminApp } from './admin/AdminApp';
import { CashierApp } from './cashier/CashierApp';

// waiters work in their own app (waiter/)
const APP_ROLES: Role[] = ['cashier', 'admin'];

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/cashier" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider roles={APP_ROLES}>
      {/* hash routing: works from a plain static folder, from Django and inside the Android app */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login home="/cashier" />} />
          <Route path="/cashier" element={<Guard roles={['cashier', 'admin']}><CashierApp /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><AdminApp /></Guard>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
      <Toaster />
    </AuthProvider>
  );
}
