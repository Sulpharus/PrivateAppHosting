// The installed portal shows apps and (when switched on) outside websites in its own viewers
// (ADR 0032). Chrome on Android shows its bar for every page outside the installed app's scope,
// and every app has its own origin, so an app opened directly would always get that bar.

import { platform } from './supabase.ts';

/** The portal runs as an installed app (home screen, desktop window), not in a browser tab. */
export function isInstalled(): boolean {
  if (typeof matchMedia !== 'function') return false;
  return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
    (mode) => matchMedia(`(display-mode: ${mode})`).matches,
  );
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export type LinkTarget =
  | { kind: 'portal'; path: string }
  | { kind: 'app'; slug: string; path: string }
  | { kind: 'web'; url: string };

/** Where a link leads: a portal page, a hosted app (`<slug>.<portal host>`) or an outside site. */
export function linkTarget(href: string, portal: URL = new URL(location.href)): LinkTarget | null {
  let url: URL;
  try {
    url = new URL(href, portal);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (url.origin === portal.origin) return { kind: 'portal', path };
  const suffix = `.${portal.hostname}`;
  if (
    url.protocol === portal.protocol &&
    url.port === portal.port &&
    url.hostname.endsWith(suffix)
  ) {
    const slug = url.hostname.slice(0, -suffix.length);
    if (SLUG.test(slug)) return { kind: 'app', slug, path };
  }
  return { kind: 'web', url: url.href };
}

/** The viewer's address for an app page: `/a/<slug>/<path>`. */
export function appViewerPath(slug: string, path = '/'): string {
  return `/a/${slug}${path.startsWith('/') ? path : `/${path}`}`;
}

export function webViewerPath(url: string): string {
  return `/web?url=${encodeURIComponent(url)}`;
}

// Settings of the installation (Verwaltung → Einstellungen), remembered for offline starts.
const SETTINGS_KEY = 'mn-instance-settings';
export interface InstanceSettings {
  external_viewer: boolean;
}
let settings: InstanceSettings = readStored();

function readStored(): InstanceSettings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? '{}',
    ) as Partial<InstanceSettings>;
    return { external_viewer: stored.external_viewer === true };
  } catch {
    return { external_viewer: false };
  }
}

export function instanceSettings(): InstanceSettings {
  return settings;
}

export function rememberSettings(next: InstanceSettings): void {
  settings = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the value from the database still applies for this visit.
  }
}

export async function loadInstanceSettings(): Promise<InstanceSettings> {
  const { data, error } = await platform()
    .from('instance_settings')
    .select('external_viewer')
    .eq('id', 1)
    .maybeSingle();
  if (!error && data) rememberSettings({ external_viewer: data.external_viewer === true });
  return settings;
}

// Only apps the gate serves can be shown: it adds pwa.js and allows the portal as frame ancestor.
// Remote programs, containers on the hardware server, api., ai. and link tiles are left alone.
const APPS_KEY = 'mn-viewer-apps';
const VIEWABLE_KINDS = new Set(['static', 'spa', 'nextjs']);
let viewable: Set<string> = readStoredApps();

function readStoredApps(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(APPS_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remembers which slugs are apps served by the gate (from the app list the portal loads). */
export function rememberApps(apps: readonly { slug: string; kind: string }[]): void {
  viewable = new Set(apps.filter((app) => VIEWABLE_KINDS.has(app.kind)).map((app) => app.slug));
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify([...viewable]));
  } catch {
    // Private mode: the list still applies for this visit.
  }
}

export function isViewableApp(slug: string): boolean {
  return viewable.has(slug);
}

/** Navigation state of the viewers: opened by the portal itself, and from where. */
export interface ViewerState {
  fromPortal: true;
  from: string;
}

export function viewerState(): ViewerState {
  return { fromPortal: true, from: `${location.pathname}${location.search}${location.hash}` };
}

/** A message from an app in the viewer: `{ type: 'mn:open', url }` (pwa.js, the SDK). */
export function openRequest(
  event: Pick<MessageEvent, 'data' | 'origin' | 'source'>,
  frame: MessageEventSource | null | undefined,
  portal: URL = new URL(location.href),
): string | null {
  if (!frame || event.source !== frame) return null;
  const from = linkTarget(event.origin, portal);
  if (from?.kind !== 'app' || from.path !== '/') return null;
  if (typeof event.data !== 'object' || event.data === null) return null;
  const { type, url } = event.data as { type?: unknown; url?: unknown };
  if (type !== 'mn:open' || typeof url !== 'string' || url.length > 4096) return null;
  return url;
}

/**
 * Where the installed portal opens a link: the app viewer for apps the gate serves, the web
 * viewer for outside sites when it is switched on and the link does not ask for a new window.
 * Null: leave the link alone (the browser opens it as before).
 */
export function viewerRoute(
  href: string,
  options: { newWindow?: boolean } = {},
): { to: string; state: ViewerState } | null {
  if (!isInstalled()) return null;
  const target = linkTarget(href);
  if (!target) return null;
  if (target.kind === 'app' && isViewableApp(target.slug))
    return { to: appViewerPath(target.slug, target.path), state: viewerState() };
  if (target.kind === 'web' && settings.external_viewer && !options.newWindow)
    return { to: webViewerPath(target.url), state: viewerState() };
  return null;
}
