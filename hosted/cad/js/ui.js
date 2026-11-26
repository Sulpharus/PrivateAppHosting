// Small DOM helpers shared by the views: element builder, icons, number formats, a context menu.

export const t = (key, params) => window.mnI18n.t(key, params);

/** el('button.mn-btn', { type: 'button', onclick }, 'Text' | Node, …) — text is always textContent. */
export function el(spec, attrs = {}, ...children) {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object')
      for (const [p, val] of Object.entries(v)) node.style.setProperty(p, val);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const PATHS = {
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M20 20l-4-4',
  select: 'M5 3l14 8-6 2-2 6z',
  line: 'M5 19L19 5',
  poly: 'M4 18l5-9 6 5 5-10',
  rect: 'M4 6h16v12H4z',
  circle: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18',
  arc: 'M4 18a9 9 0 0 1 16 0',
  dim: 'M4 8v8M20 8v8M4 12h16M7 10l-3 2 3 2M17 10l3 2-3 2',
  text: 'M5 6h14M12 6v13',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4',
  box: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  cylinder: 'M5 6a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 6v12a7 3 0 0 0 14 0V6',
  sphere: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12a9 3.5 0 0 0 18 0',
  cone: 'M12 3L5 18a7 3 0 0 0 14 0z',
  extrude: 'M5 15h10v5H5zM5 15l4-5h10l-4 5M19 10v5l-4 5',
  thread: 'M8 3v18M16 3v18M8 6l8-2M8 10l8-2M8 14l8-2M8 18l8-2',
  hole: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M3 3h18v18H3z',
  import: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  export: 'M12 15V3M7 8l5-5 5 5M4 20h16',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  views: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM16 14l3 3-3 3',
  ai: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5M12 17.5v.5',
  close: 'M6 6l12 12M18 6L6 18',
  folder: 'M3 6h6l2 2h10v11H3z',
  settings:
    'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  pencil: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  cube3d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  drawing: 'M4 4h16v16H4zM4 15h16M12 15v5',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
  eyeOff:
    'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.5M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 4.4-1',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  send: 'M4 12l16-8-6 16-2-6z',
  stop: 'M7 7h10v10H7z',
  check: 'M5 12l5 5 9-10',
  restore: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5',
  rotate: 'M20 12a8 8 0 1 1-3-6.2M20 4v5h-5',
  mirror: 'M12 3v18M8 7L3 12l5 5zM16 7l5 5-5 5z',
  array: 'M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  logo: 'M5 19V5h14M9 15l6-6M5 19l4-4',
};

export function icon(name, { size = 22, stroke = 1.8 } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', stroke);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.more);
  svg.append(path);
  return svg;
}

/** Number in the person's language, with up to `digits` decimals. */
export function fmt(v, digits = 2) {
  return new Intl.NumberFormat(window.mnI18n.locale, { maximumFractionDigits: digits }).format(v);
}

export function fmtDate(iso) {
  if (!iso) return '';
  return window.mnui.date.format(String(iso).slice(0, 10));
}

export function fmtDateTime(iso) {
  return new Intl.DateTimeFormat(window.mnI18n.locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Reads a typed number the German or the English way ("1.234,5", "1,234.5", "12,5", "12.5"). */
export function readNumber(text) {
  let s = String(text).trim().replace(/\s/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) s = s.replace(',', '.');
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Downloads a Blob as a file. */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const safeName = (name) =>
  (name || 'cad')
    .replace(/[^\p{L}\p{N}_ -]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'cad';

let menu = null;
/**
 * A small context menu at (x, y) with items [{ label, icon, onClick, danger }]. Arrow keys move,
 * Escape closes and returns focus. Every item is also reachable elsewhere by button.
 */
export function contextMenu(x, y, items, back = document.activeElement) {
  closeMenu();
  const list = el('div.cad-menu', { role: 'menu' });
  for (const item of items) {
    const b = el(
      `button.cad-menu-item${item.danger ? '.cad-menu-item--danger' : ''}`,
      {
        type: 'button',
        role: 'menuitem',
        onclick: () => {
          closeMenu(back);
          item.onClick();
        },
      },
      item.icon ? icon(item.icon, { size: 18 }) : null,
      item.label,
    );
    list.append(b);
  }
  list.addEventListener('keydown', (e) => {
    const buttons = [...list.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(back);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length].focus();
    } else if (e.key === 'Tab') closeMenu(back);
  });
  document.body.append(list);
  const r = list.getBoundingClientRect();
  list.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  list.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  list.querySelector('button')?.focus();
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  menu = list;
}

function outside(e) {
  if (menu && !menu.contains(e.target)) closeMenu();
}

export function closeMenu(back) {
  if (!menu) return;
  document.removeEventListener('pointerdown', outside);
  menu.remove();
  menu = null;
  if (back?.isConnected) back.focus();
}

/** True while the person types in a field (shortcuts stay off then). */
export function typing(e) {
  const tgt = e.target;
  return (
    tgt instanceof HTMLElement &&
    (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))
  );
}

/** A help sheet: title plus two to five sentences. */
export function helpSheet(titleKey, textKeys) {
  const body = el(
    'div',
    {},
    el(
      'div.mn-sheet-bar',
      {},
      el('button.mn-btn.mn-btn--ghost', { type: 'button', 'data-mn-close': '' }, t('common.close')),
      el('h2', {}, t(titleKey)),
      el('span'),
    ),
    el('div.mn-sheet-body', {}, ...textKeys.map((k) => el('p', {}, t(k)))),
  );
  window.mnui.sheet.open(body);
}
