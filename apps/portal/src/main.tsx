import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx';
import { StepUpProvider } from './auth/StepUp.tsx';
import { loadConfig, setRuntimeConfig } from './config.ts';
import { initApi } from './lib/api.ts';
import { initSupabase } from './lib/supabase.ts';
import { applyStoredTheme } from './lib/theme.ts';
import { Account } from './routes/Account.tsx';
import { AuthConfirm, AuthRefresh } from './routes/AuthPages.tsx';
import { Home } from './routes/Home.tsx';
import { Login } from './routes/Login.tsx';
import { Welcome } from './routes/Welcome.tsx';
import './styles.css';

// The Host Manager is only loaded for admins.
const AdminLayout = lazy(() =>
  import('./admin/AdminLayout.tsx').then((m) => ({ default: m.AdminLayout })),
);
const Overview = lazy(() => import('./admin/Overview.tsx').then((m) => ({ default: m.Overview })));
const Apps = lazy(() => import('./admin/Apps.tsx').then((m) => ({ default: m.Apps })));
const Users = lazy(() => import('./admin/Users.tsx').then((m) => ({ default: m.Users })));
const Remote = lazy(() => import('./admin/Remote.tsx').then((m) => ({ default: m.Remote })));
const Ai = lazy(() => import('./admin/Ai.tsx').then((m) => ({ default: m.Ai })));

function RequireSession() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!session) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return (
    <StepUpProvider>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </StepUpProvider>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/auth/confirm', element: <AuthConfirm /> },
  { path: '/auth/refresh', element: <AuthRefresh /> },
  {
    element: <RequireSession />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/welcome', element: <Welcome /> },
      { path: '/account', element: <Account /> },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Overview /> },
          { path: 'apps', element: <Apps /> },
          { path: 'users', element: <Users /> },
          { path: 'remote', element: <Remote /> },
          { path: 'ai', element: <Ai /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

async function start() {
  applyStoredTheme();
  const config = await loadConfig();
  initSupabase(config);
  initApi(config);
  setRuntimeConfig(config);
  const root = document.getElementById('root');
  if (!root) throw new Error('#root missing');
  createRoot(root).render(
    <StrictMode>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </StrictMode>,
  );
}

void start();
