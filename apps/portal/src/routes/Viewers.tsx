// The installed portal's viewers (ADR 0032). Chrome on Android puts its own bar over every page
// outside the installed app's scope, and every app lives on its own origin. So the portal shows
// apps itself, in a frame without any bar (/a/<slug>/<path>), and, when an admin switched it on in
// Verwaltung → Einstellungen, outside websites with a slim bar of its own (/web?url=…).

import { type RefObject, useEffect, useRef, useState } from 'react';
import { type NavigateFunction, useNavigate, useParams, useSearchParams } from 'react-router';
import { BackIcon, CloseIcon, ExternalIcon, Logo } from '../components/icons.tsx';
import { api } from '../lib/api.ts';
import { appUrl } from '../lib/apps.ts';
import { appViewerPath, instanceSettings, linkTarget, webViewerPath } from '../lib/viewer.ts';

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Opens a link an app handed over: portal page, another app, or an outside website. */
export function openFromApp(url: string, navigate: NavigateFunction): void {
  const target = linkTarget(url);
  if (!target) return;
  if (target.kind === 'portal') {
    // An app's "sign out" goes through the portal (it switches off push, forgets offline copies).
    if (target.path.startsWith('/logout')) navigate('/logout', { state: { fromPortal: true } });
    else navigate(target.path);
    return;
  }
  if (target.kind === 'app') {
    navigate(appViewerPath(target.slug, target.path));
    return;
  }
  if (instanceSettings().external_viewer) {
    navigate(webViewerPath(target.url));
    return;
  }
  // As before: Chrome shows the site with its own bar, over the portal. The click in the app
  // counts for the portal too; without it (a script, not a person) the portal navigates itself.
  const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
  if (activation?.isActive ?? true) window.open(target.url, '_blank', 'noopener,noreferrer');
  else location.assign(target.url);
}

function isOpenMessage(data: unknown): data is { type: 'mn:open'; url: string } {
  if (typeof data !== 'object' || data === null) return false;
  const { type, url } = data as { type?: unknown; url?: unknown };
  return type === 'mn:open' && typeof url === 'string' && url.length <= 4096;
}

/** Links an app in the frame hands over (pwa.js, the SDK's sign-in and sign-out). */
function useLinksFromApp(frame: RefObject<HTMLIFrameElement | null>) {
  const navigate = useNavigate();
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      if (linkTarget(event.origin)?.kind !== 'app') return;
      if (isOpenMessage(event.data)) openFromApp(event.data.url, navigate);
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
  const params = useParams();
  const navigate = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [src] = useState(() => {
    if (!SLUG.test(slug)) return null;
    const rest = params['*'] ?? '';
    return `${appUrl(slug)}/${rest}${location.search}${location.hash}`;
  });
  useLinksFromApp(frame);

  useEffect(() => {
    if (!src) navigate('/', { replace: true });
  }, [src, navigate]);
  if (!src) return null;

  return (
    <div className="viewer">
      <div className="viewer-body">
        <iframe
          ref={frame}
          src={src}
          title={slug}
          allow="clipboard-read; clipboard-write; fullscreen; autoplay; web-share; screen-wake-lock"
          onLoad={() => setLoaded(true)}
        />
        <Loading done={loaded} label="App wird geladen" />
      </div>
    </div>
  );
}

type WebState = 'checking' | 'showing';

/** `/web?url=…`: an outside website with the portal's own bar, if the site allows frames. */
export function WebViewer() {
  const [params] = useSearchParams();
  const url = params.get('url') ?? '';
  const [state, setState] = useState<WebState>('checking');
  const [loads, setLoads] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let host: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('scheme');
      host = parsed.host;
    } catch {
      navigate('/', { replace: true });
      return;
    }
    // Pages that refuse frames, the switched-off viewer and anything unclear open in the
    // browser as before; the viewer's entry is replaced, so "back" returns to where it came from.
    const leave = () => location.replace(url);
    if (!instanceSettings().external_viewer || !host) {
      leave();
      return;
    }
    let cancelled = false;
    api<{ frameable: boolean }>(`/frame-check?url=${encodeURIComponent(url)}`)
      .then((answer) => {
        if (cancelled) return;
        if (answer.frameable) setState('showing');
        else leave();
      })
      .catch(() => {
        if (!cancelled) leave();
      });
    return () => {
      cancelled = true;
    };
  }, [url, navigate]);

  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // Handled above.
  }

  // Every load after the first one added a step to the history; close skips all of them.
  const close = () => history.go(-Math.max(1, loads));

  return (
    <div className="viewer">
      <header className="web-bar">
        <button type="button" className="icon-button" onClick={() => history.back()}>
          <BackIcon />
          <span className="sr-only">Zurück</span>
        </button>
        <span className="web-host" title={url}>
          {host}
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
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
        {state === 'showing' && (
          <iframe
            src={url}
            title={host}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
            referrerPolicy="no-referrer"
            allow="fullscreen; clipboard-write; autoplay; encrypted-media; picture-in-picture"
            onLoad={() => setLoads((count) => count + 1)}
          />
        )}
        <Loading done={loads > 0} label="Seite wird geladen" />
      </div>
    </div>
  );
}
