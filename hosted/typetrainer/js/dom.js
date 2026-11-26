// Small DOM helpers. Text always goes in through textContent, never as markup.

/**
 * h('button', { class: 'mn-btn', onclick }, 'Text', child) → element.
 * Attribute values false/null/undefined are left out; `on…` functions become listeners.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (name.startsWith('on') && typeof value === 'function')
      el.addEventListener(name.slice(2), value);
    else if (name === 'class') el.className = value;
    else if (name === 'style' && typeof value === 'object')
      for (const [prop, v] of Object.entries(value))
        el.style.setProperty(
          prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`),
          v,
        );
    else if (name === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(name, '');
    else el.setAttribute(name, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  keyboard: 'M3 6h18v12H3z M7 10h1 M11 10h1 M15 10h1 M7 14h10',
  path: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  text: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6',
  chart: 'M4 20V11 M10 20V5 M16 20v-6 M3 20h18',
  settings: 'M4 7h9 M17 7h3 M4 12h3 M11 12h9 M4 17h11 M19 17h1 M15 5v4 M9 10v4 M17 15v4',
  plus: 'M12 5v14 M5 12h14',
  chevron: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7',
  close: 'M6 6l12 12 M18 6L6 18',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  play: 'M8 5v14l11-7z',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M4 12H2 M22 12h-2',
  badge: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.5 8z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
  spark:
    'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
};

/** A decorative stroke icon. */
export function icon(name, { filled = false } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('tt-icon');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS.plus);
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

/** Three stars, filled or outlined (shape, not only colour), with a text for screen readers. */
export function starRow(n, label) {
  const wrap = h('span', { class: 'tt-stars' });
  for (let i = 0; i < 3; i++) wrap.append(icon('badge', { filled: i < n }));
  wrap.append(h('span', { class: 'mn-sr-only' }, label));
  return wrap;
}

/** Replaces the children of el; null, undefined and false are left out (native append would print them). */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Upper case for key labels; ß stays ß (its capital would read as two keys). */
export const upper = (ch) => (ch === 'ß' ? ch : ch.toLocaleUpperCase());

export function clear(el) {
  el.replaceChildren();
  return el;
}

/** Skeleton blocks in the shape of the content while data loads. */
export function skeleton(...heights) {
  return h(
    'div',
    { class: 'tt-skeleton', 'aria-hidden': 'true' },
    heights.map((height) => h('span', { class: 'mn-sk', style: { height: `${height}px` } })),
  );
}
