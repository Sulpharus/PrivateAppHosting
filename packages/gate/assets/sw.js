// Service worker of every hosted app (ADR 0005): offline shell and cached files. Pages come from
// the network while online (the gate still checks access) and from the cache offline. App data
// is kept offline by the SDK (mn.kv with a local copy and a queue), not here.

// Replaced by the deploy with a new value each time, so every deploy installs a fresh worker and
// drops the previous caches.
const VERSION = 'dev';
const CACHE = `mininode-app-${VERSION}`;
const PRECACHE = [
  '/',
  '/_mininode/config.json',
  '/_mininode/sdk.js',
  '/_mininode/ui.css',
  '/_mininode/ui.js',
  '/_mininode/game.js',
  '/_mininode/i18n.js',
  '/_mininode/pwa.js',
  '/_mininode/manifest.webmanifest',
  '/_mininode/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((path) => cache.add(path).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mininode-app-') && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Only plain successful same-origin responses are cached (never redirects to the login). */
const cacheable = (response) => response.ok && response.type === 'basic' && !response.redirected;

function fromNetwork(request, key) {
  return fetch(request).then((response) => {
    if (cacheable(response)) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(key ?? request, copy));
    }
    return response;
  });
}

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font:16px system-ui;padding:32px"><h1>Offline</h1><p>Diese Seite wurde noch nicht online geöffnet. Sobald du wieder online bist, geht es weiter.</p></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Single-page apps render every route from "/"; static sites have one page per path.
    event.respondWith(
      fromNetwork(request, url.pathname).catch(() =>
        caches
          .match(url.pathname, { cacheName: CACHE })
          .then((hit) => hit ?? caches.match('/', { cacheName: CACHE }))
          .then((hit) => hit ?? offlinePage()),
      ),
    );
    return;
  }

  if (url.pathname === '/_mininode/config.json') {
    event.respondWith(
      fromNetwork(request).catch(() =>
        caches.match(request, { cacheName: CACHE }).then((hit) => hit ?? Response.error()),
      ),
    );
    return;
  }

  // Hashed build files and fonts never change: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/_mininode/fonts/')) {
    event.respondWith(
      caches.match(request, { cacheName: CACHE }).then((hit) => hit ?? fromNetwork(request)),
    );
    return;
  }

  // Everything else (app.js, style.css, the SDK) can change with a deploy: network first, so a
  // new page never runs with old scripts; the cached copy offline.
  event.respondWith(
    fromNetwork(request).catch(() =>
      caches.match(request, { cacheName: CACHE }).then((hit) => hit ?? Response.error()),
    ),
  );
});

// Sign-out in an app: forget cached pages and files of this user.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'mininode:clear') event.waitUntil(caches.delete(CACHE));
});
