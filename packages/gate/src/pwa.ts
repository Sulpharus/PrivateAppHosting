// Every hosted app is an installable PWA with an offline shell (ADR 0005). The gate serves the web
// manifest and a generated icon, and adds the manifest link and /_mininode/pwa.js (which
// registers /_mininode/sw.js) to every HTML page, so apps need no changes.

export interface PwaApp {
  slug: string;
  name: string;
}

/** Background of the start screen and of the system's launch screen (the manifest). */
export const SPLASH_BACKGROUND = '#f3f1ec';

/** Stable tile colour per app, from the App Kit accents (dark enough for white text). */
const TILES = ['#1c6a4f', '#1f5fbf', '#6a45b8', '#8a5a00', '#b3264f', '#0f6e78'];

export function tileColour(slug: string): string {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TILES[hash % TILES.length] ?? '#1c6a4f';
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** A square icon with the app's initial; maskable (the letter stays inside the safe zone). */
export function appIcon(app: PwaApp): string {
  const initial = escapeXml([...app.name.trim()][0]?.toUpperCase() ?? '?');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${tileColour(app.slug)}"/><text x="256" y="256" dy=".35em" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="240" font-weight="700" fill="#fff">${initial}</text></svg>`;
}

export function webManifest(app: PwaApp, appIcons: { src: string; sizes: string }[] = []) {
  return {
    id: '/',
    name: app.name,
    short_name: app.name.length > 12 ? app.name.slice(0, 12) : app.name,
    lang: 'de',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // The same colour as the start screen (SPLASH_CSS): the system's launch screen hands over to it.
    background_color: SPLASH_BACKGROUND,
    theme_color: tileColour(app.slug),
    icons: [
      ...appIcons.map((icon) => ({ ...icon, type: 'image/png', purpose: 'any' })),
      { src: '/_mininode/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  };
}

export type SplashLanguage = 'de' | 'en';

const SPLASH_TEXT = {
  de: {
    loading: 'wird geladen',
    slow: 'Das dauert länger als sonst. Die Verbindung ist vielleicht langsam.',
  },
  en: { loading: 'loading', slow: 'This is taking longer than usual. The connection may be slow.' },
} as const;

/** The language the person chose in the portal (cookie `mn-lang`), German otherwise. */
export function splashLanguage(cookieHeader: string | null): SplashLanguage {
  return /(?:^|;\s*)mn-lang=en(?:;|$)/.test(cookieHeader ?? '') ? 'en' : 'de';
}

/**
 * The start and loading screen every app shows from the first paint until the app is ready
 * (pwa.js removes it): the same for all apps, so installed apps start alike and never show a bare
 * letter tile. Colours, light and dark, from the portal's palette; only transform and opacity
 * move; no motion for people who asked for none.
 */
export const SPLASH_CSS = `#mn-splash{--mns-accent:var(--mns-tile);position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));background:${SPLASH_BACKGROUND};color:#17160f;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;opacity:1;transition:opacity .28s ease}
#mn-splash.mns-out{opacity:0;pointer-events:none}
#mn-splash .mns-tile{display:grid;place-items:center;width:116px;height:116px;border-radius:30px;background:color-mix(in srgb,var(--mns-accent) 13%,transparent)}\n#mn-splash .mns-mark{width:72px;height:72px;color:var(--mns-accent)}
#mn-splash .mns-mark path{fill:none;stroke:currentColor;stroke-width:3.5;stroke-linecap:round;opacity:.4}
#mn-splash .mns-mark circle{fill:currentColor;transform-box:fill-box;transform-origin:center;animation:mns-pulse 1.5s ease-in-out infinite}
#mn-splash .mns-mark circle:nth-of-type(2){animation-delay:.22s}
#mn-splash .mns-mark circle:nth-of-type(3){animation-delay:.44s}
#mn-splash .mns-name{margin:0;max-width:20rem;text-align:center;font-size:1.6rem;font-weight:700;letter-spacing:-.01em;line-height:1.15;overflow-wrap:anywhere}
#mn-splash .mns-bar{width:168px;height:4px;border-radius:2px;overflow:hidden;background:rgba(23,22,15,.12)}
#mn-splash .mns-bar span{display:block;width:42%;height:100%;border-radius:2px;background:var(--mns-accent);animation:mns-slide 1.35s ease-in-out infinite}
#mn-splash .mns-hint{margin:-8px 0 0;max-width:19rem;text-align:center;font-size:.9rem;line-height:1.4;opacity:.75}
#mn-splash .mns-hint[hidden]{display:none}
#mn-splash .mns-brand{position:absolute;bottom:max(24px,env(safe-area-inset-bottom));margin:0;font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;opacity:.6}
#mn-splash .mns-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes mns-pulse{0%,100%{opacity:.4;transform:scale(.82)}50%{opacity:1;transform:scale(1)}}
@keyframes mns-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-color-scheme:dark){#mn-splash{background:#121210;color:#edeae2}#mn-splash .mns-bar{background:rgba(237,234,226,.16)}#mn-splash{--mns-accent:color-mix(in srgb,var(--mns-tile) 38%,#fff)}}
@media (prefers-reduced-motion:reduce){#mn-splash{transition:none}#mn-splash .mns-mark circle{animation:none}#mn-splash .mns-bar span{width:100%;opacity:.45;animation:none}}`;

export function splashHtml(app: PwaApp, language: SplashLanguage = 'de'): string {
  const text = SPLASH_TEXT[language];
  const tile = tileColour(app.slug);
  return `<div id="mn-splash" role="status" aria-live="polite" style="--mns-tile:${tile}"><style>${SPLASH_CSS}</style><div class="mns-tile"><svg class="mns-mark" viewBox="6 4 52 52" aria-hidden="true"><path d="M32 14 16 46M32 14 48 46M16 46h32"/><circle cx="32" cy="14" r="8"/><circle cx="16" cy="46" r="8"/><circle cx="48" cy="46" r="8"/></svg></div><p class="mns-name">${escapeXml(app.name)}<span class="mns-sr"> ${text.loading}</span></p><div class="mns-bar" aria-hidden="true"><span></span></div><p class="mns-hint" hidden data-slow>${text.slow}</p><p class="mns-brand" aria-hidden="true">MiniNode</p></div>`;
}

/** Tags added to the end of <head> of every HTML page an app serves. */
export const HEAD_TAGS =
  '<link rel="manifest" href="/_mininode/manifest.webmanifest"><script src="/_mininode/pwa.js" defer></script>';

/**
 * Adds the PWA tags and the start screen unless the page already links a manifest (the portal has
 * its own). The start screen is the first thing in <body>, so it paints before any script ran.
 */
export function withPwaTags(
  response: Response,
  app?: PwaApp,
  language: SplashLanguage = 'de',
): Response {
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('text/html') || typeof HTMLRewriter === 'undefined') return response;
  let hasManifest = false;
  const rewriter = new HTMLRewriter()
    .on('link[rel="manifest"]', {
      element() {
        hasManifest = true;
      },
    })
    .on('head', {
      element(head) {
        head.onEndTag((end) => {
          if (!hasManifest) end.before(HEAD_TAGS, { html: true });
        });
      },
    });
  if (app)
    rewriter.on('body', {
      element(body) {
        if (!hasManifest) body.prepend(splashHtml(app, language), { html: true });
      },
    });
  return rewriter.transform(response);
}
