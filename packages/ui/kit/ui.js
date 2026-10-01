// MiniNode App Kit helpers, served as /_mininode/ui.js next to ui.css. Plain script, no build
// step, works with React too: everything hangs off window.mnui.
//   mnui.sheet.open(content, { tall, label, modal, onClose }) → the .mn-sheet element
//     content: a Node (preferred, e.g. template.content.cloneNode(true)) or an HTML string that
//     the caller has escaped. Traps focus, makes the page behind inert, closes on Escape and on
//     the backdrop (unless modal), restores focus. Opening another sheet closes this one and
//     calls its onClose.
//   mnui.sheet.close()
//   mnui.toast('Gespeichert')
//   mnui.theme.set('light' | 'dark' | 'system'), mnui.theme.get()
//   mnui.select(button) marks one button of a group as aria-pressed / aria-current
//   mnui.date.format('2026-10-01') → '01. Okt. 2026'; mnui.date.format('2026-10') → 'Okt. 2026'
//   Every <input type="date"> and <input type="month"> is shown as Tag · Monat · Jahr with German
//   month abbreviations, every <input type="time"> as Stunde : Minute (24 h), the same in every
//   browser. The input itself stays (hidden) and keeps
//   its ISO value and its events, so app code and forms work unchanged; `data-mn-native` on the
//   input or a parent keeps the browser's own field.
(() => {
  const THEME_KEY = 'mn-theme';
  const root = document.documentElement;

  const theme = {
    get() {
      try {
        return localStorage.getItem(THEME_KEY) || 'system';
      } catch {
        return 'system';
      }
    },
    set(value) {
      if (value === 'light' || value === 'dark') root.dataset.theme = value;
      else delete root.dataset.theme;
      try {
        if (value === 'light' || value === 'dark') localStorage.setItem(THEME_KEY, value);
        else localStorage.removeItem(THEME_KEY);
      } catch {}
    },
  };
  // A remembered choice applies before first paint when ui.js loads in <head> without defer.
  const saved = theme.get();
  if (saved !== 'system' && !root.dataset.theme) root.dataset.theme = saved;

  const FOCUSABLE = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[contenteditable="true"]',
    '[tabindex]',
  ]
    .map((s) => `${s}:not([tabindex="-1"])`)
    .join(',');
  let current = null;

  const focusables = (sheet) =>
    [...sheet.querySelectorAll(FOCUSABLE)].filter(
      (el) => !el.disabled && el.getClientRects().length,
    );

  function onKey(e) {
    if (!current || e.defaultPrevented || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCurrent(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const items = focusables(current.sheet);
    if (!items.length) {
      e.preventDefault();
      current.sheet.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    // Focus that slipped outside (a click on the backdrop of a modal sheet) comes back in.
    if (!current.sheet.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && (active === first || active === current.sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function open(content, options = {}) {
    if (current) closeCurrent(false);
    const overlay = document.createElement('div');
    overlay.className = 'mn-overlay';
    const sheet = document.createElement('div');
    sheet.className = `mn-sheet${options.tall ? ' mn-sheet--tall' : ''}`;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.tabIndex = -1;
    if (typeof content === 'string') sheet.innerHTML = content;
    else if (content) sheet.append(content);
    if (options.label) sheet.setAttribute('aria-label', options.label);
    else {
      const heading = sheet.querySelector('h1, h2');
      if (heading) {
        heading.id ||= `mn-sheet-title-${Date.now()}`;
        sheet.setAttribute('aria-labelledby', heading.id);
      }
    }
    overlay.append(sheet);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !options.modal) closeCurrent(false);
    });
    sheet.addEventListener('click', (e) => {
      if (e.target.closest('[data-mn-close]')) closeCurrent(false);
    });
    // Screen readers and Tab must not reach the page behind the sheet.
    const inerted = [...document.body.children].filter((el) => !el.inert && el !== toastEl);
    for (const el of inerted) el.inert = true;
    current = {
      overlay,
      sheet,
      inerted,
      back: document.activeElement,
      overflow: document.body.style.overflow,
      onClose: options.onClose,
    };
    document.body.append(overlay);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    sheet.focus({ preventScroll: true });
    return sheet;
  }

  function closeCurrent() {
    if (!current) return;
    const { overlay, inerted, back, overflow, onClose } = current;
    current = null;
    for (const el of inerted) el.inert = false;
    overlay.remove();
    document.body.style.overflow = overflow;
    document.removeEventListener('keydown', onKey);
    if (back && back.isConnected) back.focus({ preventScroll: true });
    if (onClose) onClose();
  }

  // The live region exists before the first message, so screen readers announce it.
  let toastEl = null;
  let toastTimer = 0;
  function toastRegion() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'mn-toast';
      toastEl.setAttribute('role', 'status');
      document.body.append(toastEl);
    }
    return toastEl;
  }
  if (document.body) toastRegion();
  else document.addEventListener('DOMContentLoaded', toastRegion, { once: true });

  function toast(message) {
    const el = toastRegion();
    el.textContent = '';
    el.classList.remove('show');
    // Next frame: the cleared region makes a repeated message count as new, and the transition runs.
    requestAnimationFrame(() => {
      el.textContent = message;
      el.classList.add('show');
    });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function select(button) {
    const group = button.parentElement;
    if (!group) return;
    const current = group.classList.contains('mn-tabs') || group.classList.contains('mn-steps');
    const value = group.classList.contains('mn-steps') ? 'step' : 'page';
    for (const b of group.children) {
      if (current) {
        if (b === button) b.setAttribute('aria-current', value);
        else b.removeAttribute('aria-current');
      } else b.setAttribute('aria-pressed', String(b === button));
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Dates: German, day · abbreviated month · year, independent of the browser's language.
  // The German abbreviations (CLDR de-DE), fixed so every browser shows the same.
  const MONTHS = [
    'Jan.',
    'Feb.',
    'März',
    'Apr.',
    'Mai',
    'Juni',
    'Juli',
    'Aug.',
    'Sept.',
    'Okt.',
    'Nov.',
    'Dez.',
  ];
  const pad = (n) => String(n).padStart(2, '0');
  // Same signature as new Option(text, value), which some DOMs lack.
  const option = (text, value) => {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = text;
    return el;
  };

  /** '2026-10-01' or a Date → '01. Okt. 2026'; '2026-10' → 'Okt. 2026'; anything else → ''. */
  function formatDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime()))
      return `${pad(value.getDate())}. ${MONTHS[value.getMonth()]} ${value.getFullYear()}`;
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(value ?? ''));
    if (!m) return '';
    const month = MONTHS[+m[2] - 1];
    if (!month) return '';
    return m[3] ? `${m[3]}. ${month} ${m[1]}` : `${month} ${m[1]}`;
  }

  const NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  let dateIds = 0;

  function labelText(input) {
    if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
    const label = input.labels?.[0];
    if (!label) return '';
    let text = '';
    for (const node of label.childNodes) if (node.nodeType === 3) text += node.textContent;
    return text.trim() || label.textContent.trim();
  }

  function enhanceDate(input) {
    if (input.dataset.mnDate || input.closest('[data-mn-native]')) return;
    const monthOnly = input.type === 'month';
    input.dataset.mnDate = monthOnly ? 'month' : 'date';
    const wrap = document.createElement('span');
    wrap.className = 'mn-date';
    const describe = document.createElement('span');
    describe.hidden = true;
    describe.id = `mn-date-${++dateIds}`;
    describe.textContent = labelText(input);
    // The visible parts sit inside the label; without this the input's name would include them.
    if (!input.getAttribute('aria-label') && describe.textContent)
      input.setAttribute('aria-label', describe.textContent);
    const control = (tag, name, options) => {
      const el = document.createElement(tag);
      el.className = `mn-date-${name.toLowerCase()}`;
      el.setAttribute('aria-label', name);
      el.setAttribute('aria-describedby', describe.id);
      if (options) el.append(...options.map(([v, t]) => option(t, v)));
      return el;
    };
    const day = monthOnly
      ? null
      : control('select', 'Tag', [
          ['', '–'],
          ...Array.from({ length: 31 }, (_, i) => [pad(i + 1), pad(i + 1)]),
        ]);
    const month = control('select', 'Monat', [
      ['', '–'],
      ...MONTHS.map((name, i) => [pad(i + 1), name]),
    ]);
    const year = control('input', 'Jahr');
    year.inputMode = 'numeric';
    year.maxLength = 4;
    year.placeholder = 'Jahr';
    year.autocomplete = 'off';
    const parts = [day, month, year].filter(Boolean);
    wrap.append(...parts, describe);
    input.after(wrap);
    input.classList.add('mn-date-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    const show = () => {
      const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(NATIVE_VALUE.get.call(input));
      year.value = m ? m[1] : '';
      month.value = m ? m[2] : '';
      if (day) day.value = m?.[3] ?? '';
      for (const el of parts) {
        el.disabled = input.disabled;
        el.removeAttribute('aria-invalid');
        if (el.setCustomValidity) el.setCustomValidity('');
      }
    };
    // Apps (and React) set .value directly: keep the visible fields in step.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return NATIVE_VALUE.get.call(this);
      },
      set(v) {
        NATIVE_VALUE.set.call(this, v);
        show();
      },
    });
    const commit = () => {
      if ((month.value || day?.value) && !year.value) year.value = String(new Date().getFullYear());
      const y = year.value.trim();
      let next = '';
      if (/^\d{4}$/.test(y) && month.value && (monthOnly || day.value)) {
        if (monthOnly) next = `${y}-${month.value}`;
        else {
          const last = new Date(+y, +month.value, 0).getDate();
          if (+day.value > last) day.value = pad(last);
          next = `${y}-${month.value}-${day.value}`;
        }
      }
      if (next === NATIVE_VALUE.get.call(input)) return;
      NATIVE_VALUE.set.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const el of parts) el.addEventListener('change', commit);
    year.addEventListener('input', () => {
      year.value = year.value.replace(/\D/g, '').slice(0, 4);
      if (year.value.length === 4) commit();
    });
    input.addEventListener('input', show);
    input.addEventListener('change', show);
    // A required, empty field: point at the first empty part instead of the hidden input.
    input.addEventListener('invalid', (e) => {
      e.preventDefault();
      const empty = parts.find((el) => !el.value) || parts[0];
      empty.setAttribute('aria-invalid', 'true');
      empty.setCustomValidity?.('Bitte ein vollständiges Datum angeben.');
      empty.reportValidity?.();
      empty.focus();
    });
    new MutationObserver(show).observe(input, { attributes: true, attributeFilter: ['disabled'] });
    show();
  }

  /** <input type="time"> as Stunde : Minute (24 hours); the minute list follows `step`. */
  function enhanceTime(input) {
    if (input.dataset.mnDate || input.closest('[data-mn-native]')) return;
    input.dataset.mnDate = 'time';
    const wrap = document.createElement('span');
    wrap.className = 'mn-date mn-time';
    const describe = document.createElement('span');
    describe.hidden = true;
    describe.id = `mn-date-${++dateIds}`;
    describe.textContent = labelText(input);
    if (!input.getAttribute('aria-label') && describe.textContent)
      input.setAttribute('aria-label', describe.textContent);
    const every = Math.max(1, Math.round((Number(input.step) || 60) / 60));
    const select = (name, values) => {
      const el = document.createElement('select');
      el.className = `mn-date-${name.toLowerCase()}`;
      el.setAttribute('aria-label', name);
      el.setAttribute('aria-describedby', describe.id);
      el.append(option('–', ''), ...values.map((v) => option(v, v)));
      return el;
    };
    const hour = select(
      'Stunde',
      Array.from({ length: 24 }, (_, i) => pad(i)),
    );
    const minute = select(
      'Minute',
      Array.from({ length: Math.ceil(60 / every) }, (_, i) => pad(i * every)),
    );
    const colon = document.createElement('span');
    colon.className = 'mn-time-colon';
    colon.textContent = ':';
    colon.setAttribute('aria-hidden', 'true');
    wrap.append(hour, colon, minute, describe);
    input.after(wrap);
    input.classList.add('mn-date-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    const show = () => {
      const m = /^(\d{2}):(\d{2})/.exec(NATIVE_VALUE.get.call(input));
      hour.value = m ? m[1] : '';
      if (m && ![...minute.options].some((o) => o.value === m[2])) minute.add(option(m[2], m[2]));
      minute.value = m ? m[2] : '';
      hour.disabled = minute.disabled = input.disabled;
    };
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return NATIVE_VALUE.get.call(this);
      },
      set(v) {
        NATIVE_VALUE.set.call(this, v);
        show();
      },
    });
    const commit = () => {
      if (hour.value && !minute.value) minute.value = '00';
      const next = hour.value && minute.value ? `${hour.value}:${minute.value}` : '';
      if (next === NATIVE_VALUE.get.call(input)) return;
      NATIVE_VALUE.set.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    hour.addEventListener('change', commit);
    minute.addEventListener('change', commit);
    input.addEventListener('input', show);
    input.addEventListener('change', show);
    input.addEventListener('invalid', (e) => {
      e.preventDefault();
      const empty = hour.value ? minute : hour;
      empty.setAttribute('aria-invalid', 'true');
      empty.setCustomValidity('Bitte eine Uhrzeit angeben.');
      empty.reportValidity();
      empty.focus();
    });
    new MutationObserver(show).observe(input, { attributes: true, attributeFilter: ['disabled'] });
    show();
  }

  const DATE_FIELDS = 'input[type="date"], input[type="month"], input[type="time"]';
  const enhanceField = (el) => (el.type === 'time' ? enhanceTime(el) : enhanceDate(el));
  function enhanceAll(root) {
    if (root.matches?.(DATE_FIELDS)) enhanceField(root);
    for (const el of root.querySelectorAll?.(DATE_FIELDS) ?? []) enhanceField(el);
  }
  function startDates() {
    const style = document.createElement('style');
    style.textContent = [
      // Fixed minimum widths: the parts wrap onto a second line in narrow columns.
      '.mn-date{display:flex;flex-wrap:wrap;gap:6px;align-items:center;align-self:start;min-width:0}',
      '.mn-date>*{flex:1 1 0;width:auto}',
      '.mn-date>.mn-date-tag{min-width:3.6em}',
      '.mn-date>.mn-date-monat{min-width:4.6em;flex-grow:1.4}',
      '.mn-date>.mn-date-jahr{min-width:4.4em;flex-grow:1.2}',
      // A label next to a taller one (with a hint) keeps its field at the top.
      'label:has(> .mn-date){align-content:start}',
      '.mn-time{flex-wrap:nowrap}.mn-time>select{min-width:3.6em}.mn-time>.mn-time-colon{flex:none;font-weight:700}',
      '.mn-date-native{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;border:0!important;opacity:0;pointer-events:none;overflow:hidden;clip-path:inset(50%)}',
    ].join('');
    document.head.append(style);
    enhanceAll(document.body);
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) enhanceAll(n);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) startDates();
  else document.addEventListener('DOMContentLoaded', startDates, { once: true });

  window.mnui = {
    sheet: { open, close: () => closeCurrent() },
    toast,
    theme,
    select,
    date: { format: formatDate, months: MONTHS },
  };
})();
