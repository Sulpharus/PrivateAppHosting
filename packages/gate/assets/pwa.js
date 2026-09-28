// Added to every app page by the gate (ADR 0005): registers the app's service worker, which
// keeps the app usable offline once it has been opened online.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/_mininode/sw.js', { scope: '/' }).catch(() => undefined);
  });
}
