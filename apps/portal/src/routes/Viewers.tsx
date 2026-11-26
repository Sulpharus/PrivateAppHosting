// The installed portal's viewers (ADR 0032). Chrome on Android puts its own bar over every page
// outside the installed app's scope, and every app lives on its own origin. So the portal shows
// apps itself, in a frame without any bar (/a/<slug>/<path>), and, when an admin switched it on in
// Verwaltung → Einstellungen, outside websites with a slim bar of its own (/web?url=…).

import { type RefObject, useEffect, useRef, useState } from 'react';
import {
  type NavigateFunction,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router';
import { BackIcon, CloseIcon, ExternalIcon, Logo } from '../components/icons.tsx';
import { api } from '../lib/api.ts';
import { appUrl } from '../lib/apps.ts';
import { sessionPersisted, supabase } from '../lib/supabase.ts';
import {
  appViewerPath,
  instanceSettings,
  isViewableApp,
  linkTarget,
  openRequest,
  type ViewerState,
  viewerState,
  webViewerPath,
} from '../lib/viewer.ts';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Opens a site the way it opened before the viewers: Chrome's view over the portal. */
function openAsBefore(url: string): void {
  // The click in the app counts for the portal too; without one (a script, not a person) the
  // portal navigates itself, and "back" returns to it.
  const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
  if (activation?.isActive ?? true) window.open(url, '_blank', 'noopener,noreferrer');
  else location.assign(url);
}

/** Opens a link an app handed over: portal page, another app, or an outside website. */
export function openFromApp(url: string, navigate: NavigateFunction): void {
  const target = linkTarget(url);
  if (!target) return;
  const state = viewerState();
  if (target.kind === 'portal') {
    // An app's "sign out" goes through the portal (it switches off push, forgets offline copies).
    if (new URL(target.path, location.origin).pathname === '/logout')
      navigate('/logout', { state: { fromPortal: true } });
    else navigate(target.path);
    return;
  }
  if (target.kind === 'app') {
    if (isViewableApp(target.slug)) navigate(appViewerPath(target.slug, target.path), { state });
    else openAsBefore(url);
    return;
  }
  if (instanceSettings().external_viewer) navigate(webViewerPath(target.url), { state });
  else openAsBefore(target.url);
}

/** Links an app in the frame hands over (pwa.js, the SDK's sign-in and sign-out). */
function useLinksFromApp(frame: RefObject<HTMLIFrameElement | null>) {
  const navigate = useNavigate();
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const url = openRequest(event, frame.current?.contentWindow);
      if (url) openFromApp(url, navigate);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [frame, navigate]);
}

function Loading({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`viewer-loading${done ? ' done' : ''}`} role="status" aria-live="polite">
      {!done && (
        <>
          <span className="viewer-mark">
            <Logo size={44} />
          </span>
          <span className="sr-only">{label}</span>
        </>
      )}
    </div>
  );
}

/** `/a/<slug>/<path>`: one hosted app, full screen, no bar. */
export function AppViewer() {
  const { slug = '' } = useParams();
  // A new frame for each app; moving inside the app is the frame's own business.
  return <AppFrame key={slug} slug={slug} />;
}

function AppFrame({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  // The app's path as written in the address (the router's splat comes back partly decoded).
  const [path] = useState(() => {
    const rest = location.pathname.slice(`/a/${slug}`.length);
    return `${rest.startsWith('/') ? rest : `/${rest}`}${location.search}${location.hash}`;
  });
  const [src, setSrc] = useState<string | null>(null);
  useLinksFromApp(frame);

  useEffect(() => {
    if (!SLUG.test(slug)) {
      navigate('/', { replace: true });
      return;
    }
    let cancelled = false;
    // The gate reads the shared session cookie: renew an expired session first, or the app would
    // have to send the person through the sign-in again (which a frame cannot show).
    void supabase()
      .auth.getSession()
      .then(() => sessionPersisted())
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setSrc(`${appUrl(slug)}${path}`);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, path, navigate]);

  return (
    <div className="viewer">
      <div className="viewer-body">
        {src && (
          <iframe
            ref={frame}
            src={src}
            title={slug}
            allow="clipboard-read; clipboard-write; fullscreen; autoplay; web-share; screen-wake-lock"
            onLoad={() => setLoaded(true)}
          />
        )}
        <Loading done={loaded} label="App wird geladen" />
      </div>
    </div>
  );
}

/** `/web?url=…`: an outside website with the portal's own bar, if the site allows frames. */
export function WebViewer() {
  const [params] = useSearchParams();
  const url = params.get('url') ?? '';
  // A new check and frame for each address (back and forward between two sites).
  return <WebFrame key={url} url={url} />;
}

function parsedSite(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
}

function WebFrame({ url }: { url: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as Partial<ViewerState> | null;
  // Only the portal itself sends people on to an outside site; a link from elsewhere to
  // /web?url=… shows the address instead (no open redirect on the portal's domain).
  const fromPortal = state?.fromPortal === true;
  const [site] = useState(() => parsedSite(url));
  const [showing, setShowing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!site) {
      navigate('/', { replace: true });
      return;
    }
    if (!fromPortal) return;
    // Pages that refuse frames, the switched-off viewer and anything unclear open as before; the
    // viewer's entry is replaced, so "back" returns to where it came from.
    const leave = () => window.location.replace(site.href);
    if (!instanceSettings().external_viewer) {
      leave();
      return;
    }
    let cancelled = false;
    api<{ frameable: boolean }>(`/frame-check?url=${encodeURIComponent(site.href)}`)
      .then((answer) => {
        if (cancelled) return;
        if (answer.frameable) setShowing(true);
        else leave();
      })
      .catch(() => {
        if (!cancelled) leave();
      });
    return () => {
      cancelled = true;
    };
  }, [site, fromPortal, navigate]);

  if (!site) return null;

  if (!fromPortal) {
    return (
      <main className="viewer-notice">
        <h1>Externe Seite</h1>
        <p className="muted">Dieser Link führt aus MiniNode hinaus:</p>
        <p className="mono">{site.host}</p>
        <div className="row">
          <a className="button primary" href={site.href} rel="noopener noreferrer">
            Öffnen
          </a>
          <button type="button" className="button" onClick={() => navigate('/', { replace: true })}>
            Zur Startseite
          </button>
        </div>
      </main>
    );
  }

  const close = () => navigate(state?.from ?? '/', { replace: true });

  return (
    <div className="viewer">
      <header className="web-bar">
        <button type="button" className="icon-button" onClick={() => history.back()}>
          <BackIcon />
          <span className="sr-only">Zurück</span>
        </button>
        <span className="web-host" title={site.href}>
          {site.host}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => window.open(site.href, '_blank', 'noopener,noreferrer')}
        >
          <ExternalIcon size={18} />
          <span className="sr-only">Im Browser öffnen</span>
        </button>
        <button type="button" className="icon-button" onClick={close}>
          <CloseIcon />
          <span className="sr-only">Schließen</span>
        </button>
      </header>
      <div className="viewer-body">
        {showing && (
          <iframe
            src={site.href}
            title={site.host}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
            referrerPolicy="no-referrer"
            allow="fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture"
            onLoad={() => setLoaded(true)}
          />
        )}
        <Loading done={loaded} label="Seite wird geladen" />
      </div>
    </div>
  );
}
