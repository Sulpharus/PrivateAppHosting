import { lazy, StrictMode, Suspense, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
} from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider.tsx';
import { StepUpProvider } from './auth/StepUp.tsx';
import { OfflineBanner } from './components/OfflineBanner.tsx';
import { loadConfig, setRuntimeConfig } from './config.ts';
import { initApi } from './lib/api.ts';
import { listenForRenewals, registerServiceWorker } from './lib/push.ts';
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
const Workshop = lazy(() => import('./admin/Workshop.tsx').then((m) => ({ default: m.Workshop })));

function RequireSession() {
  const { session, codePending, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  // Without the authenticator code the database shows nothing yet; the login page asks for it.
  if (!session || codePending) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return (
    <StepUpProvider>
      <OfflineBanner />
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </StepUpProvider>
  );
}

/**
 * `/logout`: apps send the browser here to sign out, so the portal can also switch off this
 * device's push subscription and forget its offline copies (ADR 0005).
 */
function Logout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromPortal = (location.state as { fromPortal?: boolean } | null)?.fromPortal === true;
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Only the portal and its apps may sign the user out this way (no logout from other sites).
    if (!fromPortal && !fromPlatform(document.referrer)) {
      navigate('/', { replace: true });
      return;
    }
    void signOut().finally(() => navigate('/login', { replace: true }));
  }, [signOut, navigate, fromPortal]);
  return null;
}

function fromPlatform(referrer: string): boolean {
  if (!referrer) return false;
  try {
    const from = new URL(referrer);
    const home = location.hostname;
    return (
      from.hostname === home || from.hostname.endsWith(`.${home}`) || from.hostname === 'localhost'
    );
  } catch {
    return false;
  }
}

const router = createBrowserRouter([
  { path: '/logout', element: <Logout /> },
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
          { path: 'workshop', element: <Workshop /> },
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
  // Offline shell and push notifications (ADR 0005).
  void registerServiceWorker();
  listenForRenewals();
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
