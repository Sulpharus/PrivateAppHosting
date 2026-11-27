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
      const visual = 'canvas,img,svg,video,button,input:not([type=hidden])';
      return (
        (node.textContent ?? '').trim().length > 0 ||
        node.matches(visual) ||
        node.querySelector(visual)
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

// Inside the installed portal's app viewer (/a/<slug>, ADR 0032):
//   - a link to another origin of the platform or to an outside website is handed to the portal,
//     which opens it in the right place (followed inside the frame, the portal would end up inside
//     itself);
//   - what the app opens "in a new tab" from its own content (a PDF it made, a stored file, its own
//     pages) is shown in this frame instead. A new window would leave MiniNode for the browser, and
//     an empty window opened first (to keep the click's permission across an await) would stay
//     behind as a blank MiniNode window. The system's back gesture returns to the app.
// The gate lets only the portal frame an app (CSP frame-ancestors), so a framed app always sits in
// the portal; messages go to the portal's origin only.
(() => {
  if (window.parent === window || window.parent !== window.top) return;
  const { protocol, hostname, port } = location;
  const dot = hostname.indexOf('.');
  if (dot < 0) return;
  const portalHost = hostname.slice(dot + 1);
  const portal = `${protocol}//${portalHost}${port ? `:${port}` : ''}`;

  const toPortal = (url) => window.parent.postMessage({ type: 'mn:open', url: url.href }, portal);
  // The portal itself, another app on the platform: the portal opens it.
  const onPlatform = (url) =>
    url.origin !== location.origin &&
    url.protocol === protocol &&
    url.port === port &&
    (url.hostname === portalHost || url.hostname.endsWith(`.${portalHost}`));
  // The app's own content: what it made in the browser, or its own pages.
  const ownContent = (url) =>
    url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === location.origin;
  const showHere = (url) => location.assign(url.href);
  const parse = (value) => {
    try {
      return new URL(String(value), location.href);
    } catch {
      return null;
    }
  };

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.hasAttribute('download')) return;
    const url = parse(link.href);
    if (!url) return;
    if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) {
      event.preventDefault();
      toPortal(url);
    } else if (link.target === '_blank' && ownContent(url)) {
      event.preventDefault();
      showHere(url);
    }
  });

  // window.open: the app's own content and the address given to an empty window later show here;
  // other web addresses go to the portal (like links); anything else opens as the browser would.
  const nativeOpen = window.open.bind(window);
  const route = (url) => {
    if (onPlatform(url)) toPortal(url);
    else showHere(url);
  };
  /** Stands in for a window: setting its address shows the address here. */
  const standIn = (initial) => {
    let closed = false;
    const go = (value) => {
      const url = parse(value);
      if (url && !closed) route(url);
    };
    const place = {
      get href() {
        return initial;
      },
      set href(value) {
        go(value);
      },
      assign: go,
      replace: go,
      toString: () => initial,
    };
    return {
      opener: null,
      get location() {
        return place;
      },
      set location(value) {
        go(value);
      },
      get closed() {
        return closed;
      },
      close() {
        closed = true;
      },
      focus() {},
      blur() {},
      postMessage() {},
    };
  };
  window.open = function open(address, target, features) {
    const name = target === undefined ? '_blank' : String(target);
    if (name === '_self' || name === '_parent' || name === '_top')
      return nativeOpen(address, target, features);
    const value = address === undefined || address === null ? '' : String(address);
    if (value === '' || value === 'about:blank') return standIn('about:blank');
    const url = parse(value);
    if (url && ownContent(url)) {
      showHere(url);
      return standIn(url.href);
    }
    if (url && /^https?:$/.test(url.protocol)) {
      toPortal(url);
      return standIn(url.href);
    }
    return nativeOpen(address, target, features);
  };
})();
