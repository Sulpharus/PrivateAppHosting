// Language packages for apps (ADR 0017), served as /_mininode/i18n.js. Plain script, everything
// hangs off window.mnI18n. The person chooses the language once in the portal (Konto → Sprache);
// the portal mirrors it into the `mn-lang` cookie on the shared domain, which this script reads.
// An app with a package for that language shows it; every other app stays German.
//
//   An app ships i18n/de.json and i18n/en.json (declared under "i18n" in mininode.json):
//   { "app.title": "Haushalt", "count.items": { "one": "{n} Eintrag", "other": "{n} Einträge" } }
//   (a plural object may also have "zero": "Keine Einträge", used for 0)
//
//   Markup keeps its German text (it works without script) and names the key:
//     <h1 data-i18n="app.title">Haushalt</h1>
//     <input data-i18n-attr="placeholder:search.placeholder;aria-label:search.label">
//   Script strings use the function (wait for `ready` before the first render):
//     await mnI18n.ready;  el.textContent = mnI18n.t('count.items', { n: 3 });
//
//   mnI18n.lang        the language in use: 'de' or 'en' (German when the app has no package)
//   mnI18n.locale      'de-DE' or 'en-GB', for Intl.NumberFormat and Intl.DateTimeFormat
//   mnI18n.ready       resolves once the packages are loaded
//   mnI18n.t(key, params)   the text; {name} placeholders, plural objects pick by params.n
//   mnI18n.apply(root) translates data-i18n elements below root (new nodes are handled itself)
//   mnI18n.onChange(cb)     runs after a language switch (the person changed it in another tab)
(() => {
  const SOURCE = 'de';
  const LANGS = ['de', 'en'];
  const LOCALES = { de: 'de-DE', en: 'en-GB' };
  const COOKIE = 'mn-lang';

  const readCookie = () => {
    const match = new RegExp(`(?:^|;\\s*)${COOKIE}=([a-z]{2})`).exec(document.cookie || '');
    return match && LANGS.includes(match[1]) ? match[1] : SOURCE;
  };

  /** Packages by language; null when the app has none for it. */
  const packages = new Map();
  const listeners = new Set();
  let wanted = readCookie();
  let lang = SOURCE;
  let current = {};
  let source = {};

  const load = async (code) => {
    if (packages.has(code)) return packages.get(code);
    let found = null;
    try {
      const response = await fetch(`/i18n/${code}.json`, { credentials: 'same-origin' });
      if (response.ok) found = await response.json();
    } catch {
      // offline without a cached copy: the app stays in German
    }
    if (found && typeof found !== 'object') found = null;
    packages.set(code, found);
    return found;
  };

  const interpolate = (text, params) =>
    text.replace(/\{(\w+)\}/g, (whole, name) => {
      const value = params?.[name];
      if (value === undefined || value === null) return whole;
      return typeof value === 'number' ? value.toLocaleString(LOCALES[lang]) : String(value);
    });

  function t(key, params) {
    let entry = current[key] ?? source[key];
    if (entry === undefined) return key;
    if (typeof entry === 'object') {
      const n = Number(params?.n ?? params?.count ?? 0);
      // `zero` is for "No entries": German and English have no zero form of their own.
      const category =
        n === 0 && 'zero' in entry ? 'zero' : new Intl.PluralRules(LOCALES[lang]).select(n);
      entry = entry[category] ?? entry.other ?? Object.values(entry)[0] ?? key;
    }
    return interpolate(String(entry), params);
  }

  function translate(el) {
    const key = el.getAttribute('data-i18n');
    if (key) {
      let params;
      try {
        params = JSON.parse(el.getAttribute('data-i18n-params') || 'null');
      } catch {
        params = undefined;
      }
      el.textContent = t(key, params ?? undefined);
    }
    const attrs = el.getAttribute('data-i18n-attr');
    if (attrs)
      for (const pair of attrs.split(';')) {
        const at = pair.indexOf(':');
        if (at > 0) el.setAttribute(pair.slice(0, at).trim(), t(pair.slice(at + 1).trim()));
      }
  }

  function apply(root = document) {
    if (
      root.nodeType === 1 &&
      (root.hasAttribute('data-i18n') || root.hasAttribute('data-i18n-attr'))
    )
      translate(root);
    for (const el of root.querySelectorAll?.('[data-i18n], [data-i18n-attr]') ?? []) translate(el);
  }

  const style = document.createElement('style');
  style.textContent = 'html.mn-i18n-loading body{visibility:hidden}';

  async function switchTo(code) {
    wanted = code;
    const [chosen, base] = await Promise.all([
      code === SOURCE ? load(SOURCE) : load(code),
      load(SOURCE),
    ]);
    // An app without a package for the language stays in German.
    lang = chosen && code !== SOURCE ? code : SOURCE;
    current = (lang === SOURCE ? base : chosen) ?? {};
    source = base ?? {};
    document.documentElement.lang = lang;
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
    else apply();
  }

  const finishLoading = () => document.documentElement.classList.remove('mn-i18n-loading');

  if (wanted !== SOURCE) {
    // No flash of German for people who chose another language; a slow network never blocks.
    document.head.append(style);
    document.documentElement.classList.add('mn-i18n-loading');
    setTimeout(finishLoading, 2500);
  }
  const ready = switchTo(wanted)
    .then(() => {
      // Parts drawn before the package arrived (date fields of kit/ui.js) pick the language up.
      if (lang !== SOURCE) window.dispatchEvent(new CustomEvent('mn:language', { detail: lang }));
    })
    .finally(finishLoading);

  // New nodes (lists drawn by script, dialogs) are translated as they appear.
  const observer = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) if (node.nodeType === 1) apply(node);
  });
  const watch = () =>
    observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.documentElement) watch();

  // The language may change in the portal while an app stays open.
  const resync = async () => {
    const next = readCookie();
    if (next === wanted) return;
    const before = lang;
    await switchTo(next);
    if (lang !== before) {
      for (const cb of listeners) cb(lang);
      window.dispatchEvent(new CustomEvent('mn:language', { detail: lang }));
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resync();
  });
  window.addEventListener('focus', () => void resync());

  window.mnI18n = {
    ready,
    t,
    apply,
    get lang() {
      return lang;
    },
    get locale() {
      return LOCALES[lang];
    },
    /** Another tab or the portal changed the language. Returns an unsubscribe function. */
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    /** Dev and tests: switch without the portal (the cookie is only set for this app). */
    async setLang(code) {
      if (!LANGS.includes(code)) return;
      document.cookie = `${COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
      await resync();
    },
  };
})();
