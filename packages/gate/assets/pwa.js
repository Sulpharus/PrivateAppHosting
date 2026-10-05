// Added to every app page by the gate (ADR 0005): registers the app's service worker, which
// keeps the app usable offline once it has been opened online, and ends the start screen
// (#mn-splash, written into the page by the gate) when the app is ready. The screen also hides
// itself by CSS after 20 s (animation mns-giveup), should this script never run.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/_mininode/sw.js', { scope: '/' }).catch(() => undefined);
  });
}

(() => {
  const splash = document.getElementById('mn-splash');
  if (!splash) return;
  const started = performance.now();
  const MIN = 450; // never a flash: long enough to read as a start screen
  const GRACE = 5000; // without the SDK's signal, content on screen is enough after this long
  const SLOW = 7000; // say so when it takes long
  const GIVE_UP = 20000; // never keep the app hidden
  // The event may have fired before this script ran (a fast module script): the SDK left a flag.
  let signedIn = window.__mnReady === true;
  let done = false;

  // Something other than the screen itself is on the page: text, a canvas, a picture, a control.
  const hasContent = () =>
    [...document.body.children].some((node) => {
      if (node === splash || /^(SCRIPT|STYLE|NOSCRIPT|LINK|TEMPLATE)$/.test(node.tagName))
        return false;
      return (
        (node.textContent ?? '').trim().length > 0 ||
        node.querySelector('canvas,img,svg,video,button,input')
      );
    });

  const hide = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    splash.classList.add('mns-out');
    setTimeout(() => splash.remove(), 400);
  };

  const check = () => {
    if (done) return;
    const elapsed = performance.now() - started;
    if (elapsed >= GIVE_UP) return hide();
    if (elapsed < MIN) return;
    if (hasContent() && (signedIn || elapsed >= GRACE)) hide();
  };

  const observer = new MutationObserver(() => requestAnimationFrame(check));
  observer.observe(document.body, { childList: true, subtree: true });
  // The SDK says the person is signed in (mn.auth.requireLogin returned).
  window.addEventListener('mn:ready', () => {
    signedIn = true;
    requestAnimationFrame(check);
  });
  window.addEventListener('load', () => requestAnimationFrame(check));
  setTimeout(check, MIN);
  setTimeout(check, GRACE);
  setTimeout(() => {
    if (!done) splash.querySelector('[data-slow]')?.removeAttribute('hidden');
  }, SLOW);
  setTimeout(check, GIVE_UP);
  // Back from the page cache: nothing to wait for.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) hide();
  });
})();
