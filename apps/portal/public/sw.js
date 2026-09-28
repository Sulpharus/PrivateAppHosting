// MiniNode portal service worker (ADR 0005): shows push notifications for all apps and keeps the
// portal usable offline (app shell and hashed assets cached, the rest from the network).
// Plain JS on purpose: served as-is from /sw.js, no build step.

// Replaced at build time (vite.config.ts) so every portal deploy installs a fresh worker and
// drops the previous caches.
const VERSION = 'dev';
const SHELL = `portal-shell-${VERSION}`;
const ASSETS = `portal-assets-${VERSION}`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
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
            .filter((key) => key.startsWith('portal-') && ![SHELL, ASSETS].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network first, the cached shell when offline (the SPA then renders from its caches).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/', { cacheName: SHELL }).then((hit) => hit ?? offlinePage())),
    );
    return;
  }

  // Hashed build assets and fonts never change: cache first.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.open(ASSETS).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ??
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone());
              return response;
            }),
        ),
      ),
    );
    return;
  }

  // Runtime config and icons: network first, cached copy offline.
  if (url.pathname === '/config.json' || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request, { cacheName: SHELL }).then((hit) => hit ?? Response.error()),
        ),
    );
  }
});

function offlinePage() {
  return new Response(
    '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font:16px system-ui;padding:32px"><h1>Offline</h1><p>MiniNode ist gerade nicht erreichbar. Sobald du wieder online bist, geht es weiter.</p></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

// Push messages from the API: { title, body?, url, tag }.
self.addEventListener('push', (event) => {
  let message = { title: 'MiniNode', url: '/' };
  try {
    message = event.data ? event.data.json() : message;
  } catch {
    message = { title: 'MiniNode', body: event.data ? event.data.text() : undefined, url: '/' };
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'de',
      data: { url: message.url },
    }),
  );
});

// Tap: focus a window that already shows the target, otherwise open it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only the portal and its apps (*.mininode.app); anything else opens the start page.
  let target = new URL('/', self.location.origin).toString();
  try {
    const url = new URL(event.notification.data?.url ?? '/', self.location.origin);
    const home = self.location.hostname;
    if (
      url.protocol === self.location.protocol &&
      (url.hostname === home || url.hostname.endsWith(`.${home}`))
    )
      target = url.toString();
  } catch {
    // Keep the start page.
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((client) => client.url === target);
      if (open && 'focus' in open) return open.focus();
      return self.clients.openWindow(target);
    }),
  );
});

// A device may renew its subscription on its own; tell open portal windows to register again.
// Without an open portal window the device stays unsubscribed until the user switches
// notifications on again under "Dein Konto" (the card then shows "aus").
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) client.postMessage({ type: 'push-renew' });
    }),
  );
});
