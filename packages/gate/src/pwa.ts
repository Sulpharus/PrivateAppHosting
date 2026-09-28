// Every hosted app is an installable PWA with an offline shell (ADR 0005). The gate serves the web
// manifest and a generated icon, and adds the manifest link and /_mininode/pwa.js (which
// registers /_mininode/sw.js) to every HTML page, so apps need no changes.

export interface PwaApp {
  slug: string;
  name: string;
}

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
    background_color: '#f3f4f1',
    theme_color: tileColour(app.slug),
    icons: [
      ...appIcons.map((icon) => ({ ...icon, type: 'image/png', purpose: 'any' })),
      { src: '/_mininode/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
    ],
  };
}

/** Tags added to the end of <head> of every HTML page an app serves. */
export const HEAD_TAGS =
  '<link rel="manifest" href="/_mininode/manifest.webmanifest"><script src="/_mininode/pwa.js" defer></script>';

/** Adds the PWA tags unless the page already links a manifest. */
export function withPwaTags(response: Response): Response {
  const type = response.headers.get('Content-Type') ?? '';
  if (!type.includes('text/html') || typeof HTMLRewriter === 'undefined') return response;
  let hasManifest = false;
  return new HTMLRewriter()
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
    })
    .transform(response);
}
