import { Navigate, NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { TopBar } from '../components/TopBar.tsx';

const LINKS: [string, string][] = [
  ['/admin', 'Übersicht'],
  ['/admin/apps', 'Apps'],
  ['/admin/users', 'Nutzer & Rollen'],
  ['/admin/remote', 'Remote-Apps'],
  ['/admin/ai', 'KI-Proxy'],
];

const EXTERNAL: [string, string][] = [
  ['https://dash.cloudflare.com/', 'Cloudflare (Deploys, DNS, Logs)'],
  ['https://supabase.com/dashboard/projects', 'Supabase (Datenbank)'],
  ['https://github.com/Sulpharus/PrivateAppHosting/actions', 'GitHub Actions'],
];

export function AdminLayout() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (profile?.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <>
      <TopBar />
      <div className="admin">
        <nav className="admin-nav" aria-label="Verwaltung">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'}>
              {label}
            </NavLink>
          ))}
          <span className="group">Weitere Dashboards</span>
          {EXTERNAL.map(([href, label]) => (
            <a key={href} href={href} target="_blank" rel="noopener">
              {label}
            </a>
          ))}
        </nav>
        <main className="admin-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}

export function euro(micro: number): string {
  return (micro / 1_000_000).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

export function dateTime(value: string | null): string {
  if (!value) return '–';
  return new Date(value).toLocaleString('de-DE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
