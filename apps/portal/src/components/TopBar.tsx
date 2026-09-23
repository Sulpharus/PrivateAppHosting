import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider.tsx';
import { platform } from '../lib/supabase.ts';
import { currentTheme, setTheme, type Theme } from '../lib/theme.ts';
import { BellIcon, Logo, MoonIcon, SearchIcon, ServerIcon, SunIcon } from './icons.tsx';

interface Notification {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  useEffect(() => {
    void platform()
      .from('notifications')
      .select('id, title, body, url, created_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setItems((data as Notification[] | null) ?? []));
  }, []);

  const markAllRead = async () => {
    const ids = items.map((item) => item.id);
    if (ids.length === 0) return;
    await platform()
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids);
    setItems([]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="icon-button"
        aria-label={items.length > 0 ? `Mitteilungen, ${items.length} neu` : 'Mitteilungen'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <BellIcon />
        {items.length > 0 && <span className="badge-dot" />}
      </button>
      {open && (
        <div className="menu">
          {items.length === 0 && (
            <p className="muted" style={{ padding: 12 }}>
              Keine neuen Mitteilungen.
            </p>
          )}
          {items.map((item) => (
            <a key={item.id} className="menu-item" href={item.url ?? '#'}>
              <strong>{item.title}</strong>
              {item.body && <small>{item.body}</small>}
            </a>
          ))}
          {items.length > 0 && (
            <button type="button" className="menu-item" onClick={markAllRead}>
              <small>Alle als gelesen markieren</small>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar(props: { search?: string; onSearch?: (value: string) => void }) {
  const { profile } = useAuth();
  const [theme, setThemeState] = useState<Theme>(currentTheme());
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="MiniNode Startseite">
        <Logo />
        <span>mininode</span>
      </Link>
      {props.onSearch ? (
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            placeholder="App suchen"
            aria-label="App suchen"
            value={props.search ?? ''}
            onChange={(event) => props.onSearch?.(event.target.value)}
          />
        </label>
      ) : (
        <span className="spacer" />
      )}
      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="icon-button"
          aria-label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <Notifications />
        {profile?.role === 'admin' && (
          <Link to="/admin" className="button hide-mobile">
            <ServerIcon />
            Verwaltung
          </Link>
        )}
        <Link to="/account" className="avatar" aria-label="Konto und Abmelden">
          {(profile?.displayName ?? '?').slice(0, 1).toUpperCase()}
        </Link>
      </div>
    </header>
  );
}
