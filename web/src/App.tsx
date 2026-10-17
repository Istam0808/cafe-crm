import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminApp } from './admin/AdminApp';
import { AuthProvider, homePath, useAuth } from './auth';
import { CashierApp } from './cashier/CashierApp';
import { Toaster } from './components/Toast';
import { Login } from './pages/Login';
import type { Role } from './types';
import { WaiterApp } from './waiter/WaiterApp';

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      {/* hash routing: works from a plain static folder, from Django and inside the Android app */}
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/waiter/*" element={<Guard roles={['waiter', 'cashier', 'admin']}><WaiterApp /></Guard>} />
          <Route path="/cashier" element={<Guard roles={['cashier', 'admin']}><CashierApp /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><AdminApp /></Guard>} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </HashRouter>
      <Toaster />
    </AuthProvider>
  );
}
