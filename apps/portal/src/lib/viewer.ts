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

/**
 * Where the installed portal opens a link: the app viewer for apps, the web viewer for outside
 * sites when it is switched on. Null: leave the link alone (the browser opens it as before).
 */
export function viewerRoute(href: string): string | null {
  if (!isInstalled()) return null;
  const target = linkTarget(href);
  if (!target) return null;
  if (target.kind === 'app') return appViewerPath(target.slug, target.path);
  if (target.kind === 'web' && settings.external_viewer) return webViewerPath(target.url);
  return null;
}
