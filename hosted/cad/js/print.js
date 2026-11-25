// The print view of a drawing (route ?drucken=<project id>): the sheet at its real size in
// millimetres with a frame and a title block, printed through the browser ("Als PDF speichern" is
// the same dialog). Scales are exact: 1:1 on paper is 1:1 in the model.

import { bounds } from './geom.js';
import { svgOf } from './io.js';
import { PAPERS, SCALES } from './model.js';
import { el, fmtDate, icon, t } from './ui.js';

const MARGIN = 16; // @page margin in mm
const TB_W = 180;
const TB_H = 32;

export const scaleFactor = (s) => {
  const [a, b] = s.split(':').map(Number);
  return a / b;
};

/** The largest standard scale at which the drawing fits the free area of the sheet. */
export function fitScale(entities, paper, orientation) {
  const b = bounds(entities);
  if (!b) return '1:1';
  const [W, H] = sheetSize(paper, orientation);
  const areaW = W - 10;
  const areaH = H - TB_H - 10;
  for (const s of SCALES) {
    const k = scaleFactor(s);
    if (b.w * k <= areaW && b.h * k <= areaH) return s;
  }
  return SCALES.at(-1);
}

export function sheetSize(paper, orientation) {
  const [long, short] = PAPERS[paper] ?? PAPERS.A4;
  const [w, h] = orientation === 'portrait' ? [short, long] : [long, short];
  return [w - 2 * MARGIN, h - 2 * MARGIN];
}

const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/** The sheet as an SVG string in millimetres (all user text escaped). */
export function sheetSvg(
  project,
  sheet,
  { author = '', printed = new Date().toISOString().slice(0, 10), labels },
) {
  const [W, H] = sheetSize(sheet.paper, sheet.orientation);
  const k = scaleFactor(sheet.scale);
  const ents = project.model.sketch.entities;
  const b = bounds(ents) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0, w: 0, h: 0 };
  // Centre of the free area (above the title block).
  const cx = W / 2;
  const cy = (H - TB_H) / 2;
  const mx = (b.minX + b.maxX) / 2;
  const my = (b.minY + b.maxY) / 2;
  const stroke = 0.35 / k;
  const body = ents.map((e) => svgOf(e, stroke, k)).join('');
  const x0 = W - TB_W;
  const y0 = H - TB_H;
  const cell = (x, y, w, h, label, value, big = false) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}"/><text x="${x + 1.5}" y="${y + 3}" font-size="2" stroke="none" fill="black">${esc(label)}</text><text x="${x + 1.5}" y="${y + h - 2}" font-size="${big ? 5 : 3.2}" stroke="none" fill="black"${big ? ' font-weight="bold"' : ''}>${esc(value)}</text>`;
  const tb = [
    cell(x0, y0, 120, 16, labels.title, sheet.title || project.name, true),
    cell(x0 + 120, y0, 60, 16, labels.number, sheet.number || '–'),
    cell(x0, y0 + 16, 40, 16, labels.scale, sheet.scale),
    cell(x0 + 40, y0 + 16, 50, 16, labels.material, sheet.material || '–'),
    cell(x0 + 90, y0 + 16, 45, 16, labels.author, author || '–'),
    cell(x0 + 135, y0 + 16, 45, 16, labels.date, printed),
  ].join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="sans-serif"><g fill="none" stroke="black" stroke-width="0.5"><rect x="0.25" y="0.25" width="${W - 0.5}" height="${H - 0.5}" stroke-width="0.7"/>${tb}</g><text x="2" y="${H - 2}" font-size="2" fill="black">${esc(labels.app)} · ${esc(labels.units)}</text><g transform="translate(${cx} ${cy}) scale(${k} ${-k}) translate(${-mx} ${-my})" fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round">${body}</g></svg>`;
}

export function mountPrint(root, app, project) {
  const sheet = { ...project.model.sheet };
  if (!sheet.title) sheet.title = project.name;
  const pageStyle = el('style');
  document.head.append(pageStyle);
  const holder = el('div.cad-print-sheet', { role: 'img', 'aria-label': t('print.preview') });
  const labels = {
    title: t('print.tb.title'),
    number: t('print.tb.number'),
    scale: t('print.tb.scale'),
    material: t('print.tb.material'),
    author: t('print.tb.author'),
    date: t('print.tb.date'),
    app: t('print.tb.app'),
    units: t('print.tb.units'),
  };

  const draw = () => {
    const svg = sheetSvg(project, sheet, {
      author: app.authorName(),
      printed: fmtDate(new Date().toISOString()),
      labels,
    });
    // Parsed as SVG (never innerHTML); every text from people went through esc() above.
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    holder.replaceChildren(document.importNode(doc.documentElement, true));
    pageStyle.textContent = `@page { size: ${sheet.paper} ${sheet.orientation}; margin: ${MARGIN}mm; }`;
  };

  const select = (key, options, label) => {
    const s = el(
      'select',
      {
        onchange: async (e) => {
          sheet[key] = e.target.value;
          draw();
          await persist();
        },
      },
      ...options.map(([v, l]) => el('option', { value: v, selected: sheet[key] === v }, l)),
    );
    return el('label.mn-field', {}, label, s);
  };
  const text = (key, label) => {
    const input = el('input', {
      type: 'text',
      value: sheet[key] ?? '',
      maxlength: key === 'title' ? '120' : '80',
    });
    input.addEventListener('change', async () => {
      sheet[key] = input.value;
      draw();
      await persist();
    });
    return el('label.mn-field', {}, label, input);
  };
  async function persist() {
    project.model = { ...project.model, sheet: { ...sheet } };
    try {
      await app.store.saveProject(project);
    } catch {
      window.mnui.toast(t('editor.saveError'));
    }
  }

  const scaleField = select(
    'scale',
    SCALES.map((s) => [s, s]),
    t('print.scale'),
  );
  const controls = el(
    'div.cad-print-controls.mn-form',
    {},
    el(
      'div.mn-grid-2',
      {},
      select(
        'paper',
        Object.keys(PAPERS).map((p) => [p, p]),
        t('print.paper'),
      ),
      select(
        'orientation',
        [
          ['landscape', t('print.landscape')],
          ['portrait', t('print.portrait')],
        ],
        t('print.orientation'),
      ),
    ),
    el(
      'div.mn-grid-2',
      {},
      scaleField,
      el(
        'div.mn-field',
        {},
        el('span', {}, t('print.fitLabel')),
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: async () => {
              sheet.scale = fitScale(project.model.sketch.entities, sheet.paper, sheet.orientation);
              scaleField.querySelector('select').value = sheet.scale;
              draw();
              await persist();
            },
          },
          icon('fit', { size: 18 }),
          t('print.fit'),
        ),
      ),
    ),
    text('title', t('print.tb.title')),
    el(
      'div.mn-grid-2',
      {},
      text('material', t('print.tb.material')),
      text('number', t('print.tb.number')),
    ),
  );
  root.replaceChildren(
    el(
      'div.cad-print-bar',
      {},
      el(
        'button.mn-btn.mn-btn--ghost',
        { type: 'button', onclick: () => app.go({ project: project.id }) },
        t('common.back'),
      ),
      el('span.mn-grow'),
      el(
        'button.mn-btn.mn-btn--primary',
        { type: 'button', onclick: () => window.print() },
        icon('print', { size: 18 }),
        t('print.go'),
      ),
    ),
    el(
      'div.mn-split.mn-split--end.cad-print-layout',
      {},
      el('div.cad-print-paper', {}, holder),
      el('div', {}, controls, el('p.mn-hint', {}, t('print.hint'))),
    ),
  );
  if (!project.model.sketch.entities.length)
    root.prepend(el('div.mn-banner.mn-banner--warn', { role: 'note' }, t('print.empty')));
  draw();
  return {
    leave() {
      pageStyle.remove();
    },
  };
}
