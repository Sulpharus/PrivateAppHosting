// Small DOM helpers shared by the views: elements from text only (never innerHTML with data),
// icons, skeletons, empty and error states, formatting for the person's language.
import { formatCents } from './money.js';

export const t = (key, params) => window.mnI18n.t(key, params);
export const locale = () => window.mnI18n.locale;

/** An element: h('button', { class: 'mn-btn', onclick }, 'Text', child). Strings become text. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function')
      el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    } else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

const SVG = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: 'M3.5 11 12 4l8.5 7v9h-6v-5.5h-5V20h-6z',
  invoice: 'M6 3.5h9l3.5 3.5v13.5H6zM14.5 3.5V7h4M9 11h6M9 14.5h6M9 18h3.5',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.3a3.3 3.3 0 0 1 0 6.4M18 14.6c2 .7 3.2 2.5 3.5 5.4',
  blocks: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  chart: 'M5 20V11M10 20V5M15 20v-7M20 20V8M3.5 20h17',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  mail: 'M3.5 6h17v12h-17zM3.5 6.5 12 13l8.5-6.5',
  file: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4',
  calendar: 'M4 5.5h16v15H4zM4 10h16M8 3v4M16 3v4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff:
    'M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4M6.3 6.8C3.9 8.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  paperclip:
    'M20 11.5 12.2 19.3a5 5 0 0 1-7-7l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

export function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.file);
  svg.append(path);
  return svg;
}

export const money = (cents) => formatCents(cents, locale());
/** An amount that the "hide amounts" switch blurs. */
export const amount = (cents, cls = '') =>
  h('span', { class: `amount mn-num ${cls}`.trim() }, money(cents));
export const date = (iso) => (iso ? window.mnui.date.format(iso) : '');
export const shortDate = (iso) =>
  iso
    ? new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${iso}T00:00:00Z`),
      )
    : '';

export function skeleton(rows = 4, height = 64) {
  return h(
    'div',
    { class: 'mn-list', 'aria-busy': 'true' },
    Array.from({ length: rows }, () =>
      h('span', { class: 'mn-sk', style: { height: `${height}px` } }),
    ),
  );
}

export function empty({ iconName = 'invoice', title, text, action, secondary }) {
  return h(
    'div',
    { class: 'mn-empty' },
    h('div', { class: 'mn-empty-icon' }, icon(iconName)),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    action
      ? h(
          'button',
          { class: 'mn-btn mn-btn--primary', type: 'button', onclick: action.onClick },
          action.label,
        )
      : null,
    secondary
      ? h(
          'button',
          { class: 'mn-btn mn-btn--ghost', type: 'button', onclick: secondary.onClick },
          secondary.label,
        )
      : null,
  );
}

export function errorBox(message, retry) {
  return h(
    'div',
    { class: 'mn-banner mn-banner--bad', role: 'alert' },
    h('span', {}, message),
    ' ',
    retry
      ? h('button', { class: 'mn-btn', type: 'button', onclick: retry }, t('common.retry'))
      : null,
  );
}

export function debounce(fn, ms) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Lower case without accents, for search ("Müller" finds "muller"). */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase(locale());
}

/** Text with every match of `query` wrapped in <mark>, built from text nodes. */
export function highlight(text, query) {
  const value = String(text ?? '');
  const q = fold(query).trim();
  if (!q) return document.createTextNode(value);
  const folded = fold(value);
  // Folding keeps one character per character for Latin text; fall back to plain text otherwise.
  if (folded.length !== value.length) return document.createTextNode(value);
  const span = document.createDocumentFragment();
  let at = 0;
  for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, i + q.length)) {
    if (i > at) span.append(value.slice(at, i));
    span.append(h('mark', {}, value.slice(i, i + q.length)));
    at = i + q.length;
  }
  span.append(value.slice(at));
  return span;
}

/** A status chip for an invoice status key. */
export function statusChip(status) {
  const cls = {
    draft: 'mn-chip--plain',
    open: '',
    partial: 'mn-chip--warn',
    overdue: 'mn-chip--bad',
    paid: 'mn-chip--ok',
    cancelled: 'mn-chip--plain',
    cancellation: 'mn-chip--plain',
  }[status.key];
  const label =
    status.key === 'overdue'
      ? t('status.overdueDays', { n: status.days ?? 0 })
      : t(`status.${status.key}`);
  return h('span', { class: `mn-chip ${cls}`.trim() }, label);
}

/** Downloads bytes or text as a file (blob URL on an <a download>, made in the click handler). */
export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** A file name without characters that file systems refuse. */
export function safeName(text) {
  return String(text ?? '')
    .replace(/[\\/:*?"<>|\n\r]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 80);
}

/** Section heading with an optional count and action. */
export function sect(title, count, action) {
  return h(
    'div',
    { class: 'mn-sect' },
    h(
      'h2',
      {},
      title,
      count !== undefined && count !== null ? h('small', {}, String(count)) : null,
    ),
    action
      ? h('button', { class: 'mn-link', type: 'button', onclick: action.onClick }, action.label)
      : null,
  );
}

/** A labelled field around an input. */
export function field(label, input, { hint, required } = {}) {
  const id = input.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  const err = h('p', { class: 'mn-error', role: 'alert', hidden: true, id: `${id}-err` });
  const parts = [label];
  if (required) parts.push(` (${t('form.required')})`);
  const wrap = h('label', { class: 'mn-field' }, parts.join(''), input);
  const box = h(
    'div',
    { class: 'fieldbox' },
    wrap,
    hint ? h('p', { class: 'mn-hint' }, hint) : null,
    err,
  );
  box.setError = (message) => {
    err.hidden = !message;
    err.textContent = message ?? '';
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', err.id);
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
    }
  };
  return box;
}
