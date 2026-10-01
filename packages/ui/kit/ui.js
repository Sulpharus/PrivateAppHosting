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
//   browser. The input itself stays (hidden) and keeps its ISO value, its events, required,
//   min/max, disabled and form reset; setting .value, .valueAsDate or .valueAsNumber updates the
//   parts, and focusing it focuses the first part. Invalid fields say why below the parts.
//   `data-mn-native` on the input or a parent keeps the browser's own field.
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
  // Apps with their own toast set data-mn-toast="off" on <html> and get no second live region.
  if (root.dataset.mnToast !== 'off') {
    if (document.body) toastRegion();
    else document.addEventListener('DOMContentLoaded', toastRegion, { once: true });
  }

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

  const proto = HTMLInputElement.prototype;
  const NATIVE = {
    value: Object.getOwnPropertyDescriptor(proto, 'value'),
    valueAsDate: Object.getOwnPropertyDescriptor(proto, 'valueAsDate'),
    valueAsNumber: Object.getOwnPropertyDescriptor(proto, 'valueAsNumber'),
  };
  /** Wraps of fields this copy of ui.js enhanced (a cloned wrap is not in here). */
  const fields = new WeakMap();
  let fieldIds = 0;

  const shown = (el) =>
    !el.hidden &&
    (typeof getComputedStyle !== 'function' || getComputedStyle(el).display !== 'none');

  /** The field's visible label text: its own aria-label, the rendered label text, or aria-labelledby. */
  function labelText(input) {
    const own = input.dataset.mnLabel === undefined ? input.getAttribute('aria-label') : null;
    if (own) return own;
    const label = input.labels?.[0];
    if (label) {
      let text = '';
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3) text += child.textContent;
          else if (
            child.nodeType === 1 &&
            child !== input &&
            !child.classList.contains('mn-date') &&
            !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(child.tagName) &&
            shown(child)
          )
            walk(child);
        }
      };
      walk(label);
      if (text.trim()) return text.replace(/\s+/g, ' ').trim();
    }
    const ids = input.getAttribute('aria-labelledby');
    if (ids)
      return ids
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
    return '';
  }

  const PARTS = {
    date: [
      ['Tag', 'select'],
      ['Monat', 'select'],
      ['Jahr', 'input'],
    ],
    month: [
      ['Monat', 'select'],
      ['Jahr', 'input'],
    ],
    time: [
      ['Stunde', 'select'],
      ['Minute', 'select'],
    ],
  };

  /**
   * Shows <input type="date|month|time"> as German parts. The input stays the source of truth:
   * it keeps the ISO value, its name in the form and its events; the parts follow it.
   */
  function enhanceField(input) {
    if (input.closest('[data-mn-native]')) return;
    // From the attribute: browsers without month fields (desktop Firefox, Safari) report 'text'.
    const type = input.getAttribute('type')?.toLowerCase();
    const kind = type === 'time' ? 'time' : type === 'month' ? 'month' : 'date';
    /** False where the browser does not know this type: then min and max are checked here. */
    const supported = input.type === kind;
    // A cloned field brings a dead copy of the parts: drop it and enhance afresh.
    const next = input.nextElementSibling;
    if (next?.classList.contains('mn-date')) {
      if (fields.has(next)) return;
      next.remove();
    }
    const id = ++fieldIds;
    const wrap = document.createElement('span');
    wrap.className = `mn-date${kind === 'time' ? ' mn-time' : ''}`;
    // No labelled group: it would be a second element named like the field. Each part carries
    // the field name as its description instead ("Tag", described by "Beginn").
    const name = document.createElement('span');
    name.hidden = true;
    name.id = `mn-field-${id}`;
    const message = document.createElement('span');
    message.className = 'mn-date-msg';
    message.id = `mn-field-${id}-msg`;
    message.hidden = true;
    message.setAttribute('role', 'alert');

    const parts = PARTS[kind].map(([label, tag]) => {
      const el = document.createElement(tag);
      el.className = `mn-date-${label.toLowerCase()}`;
      el.setAttribute('aria-label', label);
      el.setAttribute('aria-describedby', `${name.id} ${message.id}`);
      return el;
    });
    const part = (label) => parts[PARTS[kind].findIndex(([l]) => l === label)] ?? null;
    const day = part('Tag');
    const month = part('Monat');
    const year = part('Jahr');
    const hour = part('Stunde');
    const minute = part('Minute');
    if (day)
      day.append(
        option('–', ''),
        ...Array.from({ length: 31 }, (_, i) => option(pad(i + 1), pad(i + 1))),
      );
    if (month) month.append(option('–', ''), ...MONTHS.map((m, i) => option(m, pad(i + 1))));
    if (year) {
      year.inputMode = 'numeric';
      year.maxLength = 4;
      year.placeholder = 'Jahr';
      year.autocomplete = 'off';
    }
    if (hour)
      hour.append(option('–', ''), ...Array.from({ length: 24 }, (_, i) => option(pad(i), pad(i))));
    if (minute) {
      const every = Math.max(1, Math.round((Number(input.step) || 60) / 60));
      minute.append(
        option('–', ''),
        ...Array.from({ length: Math.ceil(60 / every) }, (_, i) =>
          option(pad(i * every), pad(i * every)),
        ),
      );
    }
    const colon = kind === 'time' ? document.createElement('span') : null;
    if (colon) {
      colon.className = 'mn-time-colon';
      colon.textContent = ':';
      colon.setAttribute('aria-hidden', 'true');
      wrap.append(parts[0], colon, parts[1]);
    } else wrap.append(...parts);
    wrap.append(name, message);
    input.after(wrap);
    fields.set(wrap, input);
    input.classList.add('mn-date-native');
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    // React keeps its own value tracker on the instance: go through it, not around it.
    const own = Object.getOwnPropertyDescriptor(input, 'value') ?? NATIVE.value;
    const read = () => own.get.call(input);
    let syncing = false;

    const rename = () => {
      const text = labelText(input);
      if (name.textContent !== text) name.textContent = text;
      // The parts sit inside the label: without this the input's name would include them.
      if (text && (input.dataset.mnLabel !== undefined || !input.getAttribute('aria-label'))) {
        input.dataset.mnLabel = '';
        if (input.getAttribute('aria-label') !== text) input.setAttribute('aria-label', text);
      }
    };
    const mirror = () => {
      const off = input.disabled || input.readOnly;
      wrap.hidden = input.hidden;
      for (const el of parts) {
        el.disabled = off;
        if (input.required) el.setAttribute('aria-required', 'true');
        else el.removeAttribute('aria-required');
      }
      // App code marks the input invalid (or valid again): show it on the parts.
      if (input.getAttribute('aria-invalid') === 'true')
        parts[0].setAttribute('aria-invalid', 'true');
      else if (message.hidden) for (const el of parts) el.removeAttribute('aria-invalid');
    };
    const clearError = () => {
      message.hidden = true;
      message.textContent = '';
      for (const el of parts) el.removeAttribute('aria-invalid');
    };
    const show = () => {
      if (syncing) return;
      const v = read();
      if (kind === 'time') {
        const m = /^(\d{2}):(\d{2})/.exec(v);
        hour.value = m ? m[1] : '';
        if (m && ![...minute.options].some((o) => o.value === m[2]))
          minute.append(option(m[2], m[2]));
        minute.value = m ? m[2] : '';
      } else {
        const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
        year.value = m ? m[1] : '';
        month.value = m ? m[2] : '';
        if (day) day.value = m?.[3] ?? '';
      }
      clearError();
      checkRange();
      mirror();
    };

    // Code that sets the value (or the date or number view of it) updates the parts.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: read,
      set(v) {
        own.set.call(input, v);
        show();
      },
    });
    for (const key of ['valueAsDate', 'valueAsNumber'])
      if (NATIVE[key] && supported)
        Object.defineProperty(input, key, {
          configurable: true,
          get() {
            return NATIVE[key].get.call(input);
          },
          set(v) {
            NATIVE[key].set.call(input, v);
            show();
          },
        });

    /** The ISO value of the parts; '' while they are incomplete. */
    const compose = () => {
      if (kind === 'time') {
        if (hour.value && !minute.value) minute.value = '00';
        return hour.value && minute.value ? `${hour.value}:${minute.value}` : '';
      }
      if ((month.value || day?.value) && !year.value) year.value = String(new Date().getFullYear());
      const y = year.value.trim();
      if (!/^[1-9]\d{3}$/.test(y) || !month.value || (day && !day.value)) return '';
      if (!day) return `${y}-${month.value}`;
      const last = new Date(+y, +month.value, 0).getDate();
      if (+day.value > last) day.value = pad(last);
      return `${y}-${month.value}-${day.value}`;
    };
    /** min and max for a type the browser treats as text (ISO strings compare in order). */
    function checkRange() {
      if (supported) return;
      const v = read();
      const min = input.getAttribute('min');
      const max = input.getAttribute('max');
      const fmt = (x) => (kind === 'time' ? x : formatDate(x));
      input.setCustomValidity(
        v && min && v < min
          ? `Frühestens ${kind === 'time' ? 'um' : 'am'} ${fmt(min)}.`
          : v && max && v > max
            ? `Spätestens ${kind === 'time' ? 'um' : 'am'} ${fmt(max)}.`
            : '',
      );
    }
    const commit = () => {
      clearError();
      const next = compose();
      if (next === read()) return;
      // NATIVE.value (not the tracker) on purpose: React must see this as a change.
      NATIVE.value.set.call(input, next);
      checkRange();
      // The parts stay as the person left them, even while incomplete.
      syncing = true;
      try {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        syncing = false;
      }
    };
    for (const el of parts) el.addEventListener('change', commit);
    if (year)
      year.addEventListener('input', () => {
        const digits = year.value.replace(/\D/g, '').slice(0, 4);
        if (digits !== year.value) year.value = digits;
        if (digits.length === 4) commit();
      });
    input.addEventListener('input', show);
    input.addEventListener('change', show);
    // A click on the label, or app code that focuses the field, lands on the first part.
    input.addEventListener('focus', () => parts[0].focus());
    wrap.addEventListener('focusin', rename);
    input.form?.addEventListener('reset', () => setTimeout(show));

    // Validation: the hidden input cannot show the browser's bubble, so the field says it.
    input.addEventListener('invalid', (e) => {
      e.preventDefault();
      const v = input.validity;
      const what = kind === 'time' ? 'eine Uhrzeit' : 'ein Datum';
      const fmt = (x) => (kind === 'time' ? x : formatDate(x));
      message.textContent = v.valueMissing
        ? `Bitte ${what} angeben.`
        : v.rangeUnderflow
          ? `Frühestens ${kind === 'time' ? 'um' : 'am'} ${fmt(input.min)}.`
          : v.rangeOverflow
            ? `Spätestens ${kind === 'time' ? 'um' : 'am'} ${fmt(input.max)}.`
            : v.customError
              ? input.validationMessage
              : `Bitte ${what} vollständig angeben.`;
      message.hidden = false;
      const target = parts.find((el) => !el.value) || parts[0];
      target.setAttribute('aria-invalid', 'true');
    });
    new MutationObserver(() => {
      checkRange();
      mirror();
    }).observe(input, {
      attributes: true,
      attributeFilter: ['disabled', 'readonly', 'required', 'hidden', 'aria-invalid', 'min', 'max'],
    });
    if (input.labels?.[0])
      // Changes inside the parts (option lists, the name span) are ours, not the label's.
      new MutationObserver((records) => {
        if (records.some((r) => !wrap.contains(r.target))) rename();
      }).observe(input.labels[0], {
        childList: true,
        characterData: true,
        subtree: true,
      });
    rename();
    show();
  }

  const FIELDS = 'input[type="date"], input[type="month"], input[type="time"]';
  function enhanceAll(root) {
    if (root.matches?.(FIELDS)) enhanceField(root);
    for (const el of root.querySelectorAll?.(FIELDS) ?? []) enhanceField(el);
  }
  function startFields() {
    const style = document.createElement('style');
    style.textContent = [
      // Fixed minimum widths: the parts wrap onto a second line in narrow columns.
      '.mn-date{display:flex;flex-wrap:wrap;gap:6px;align-items:center;align-self:start;min-width:0}',
      '.mn-date>select,.mn-date>input{flex:1 1 0;width:auto}',
      '.mn-date>select.mn-date-tag{min-width:3.6em}',
      '.mn-date>select.mn-date-monat{min-width:4.6em;flex-grow:1.4}',
      '.mn-date>input.mn-date-jahr{min-width:4.4em;flex-grow:1.2}',
      '.mn-time{flex-wrap:nowrap}.mn-time>select{min-width:3.6em}.mn-time>.mn-time-colon{flex:none;font-weight:700}',
      '.mn-date>.mn-date-msg{flex:1 0 100%;font-size:.85em;font-weight:600;color:var(--mn-bad,#b42318)}',
      // A label next to a taller one (with a hint) keeps its field at the top.
      'label:has(> .mn-date){align-content:start}',
      '.mn-date-native{position:absolute!important;width:1px!important;height:1px!important;min-height:0!important;padding:0!important;border:0!important;opacity:0;pointer-events:none;overflow:hidden;clip-path:inset(50%)}',
    ].join('');
    document.head.append(style);
    enhanceAll(document.body);
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) enhanceAll(n);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) startFields();
  else document.addEventListener('DOMContentLoaded', startFields, { once: true });

  window.mnui = {
    sheet: { open, close: () => closeCurrent() },
    toast,
    theme,
    select,
    date: { format: formatDate, months: MONTHS },
  };
})();
