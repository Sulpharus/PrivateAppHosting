// The editor of one project: the drawing (2D) and the 3D model side by side in one view, the tool
// bar, typed coordinates, the properties panel, the assistant, import, export and history.

import { aiErrorKey, ask } from './ai.js';
import { area, bounds, closedProfile, dimGeometry, length } from './geom.js';
import {
  readDxf,
  readGcode,
  readObj,
  readStl,
  writeDxf,
  writeGcode,
  writeObj,
  writeStl,
  writeSvg,
} from './io.js';
import { cleanMaterial, MATERIAL_IDS, materialOf } from './materials.js';
import { applyOps, fieldsOf, nextId, normalise, STYLES } from './model.js';
import { buildScene, geometryKey } from './scene.js';
import { Sketch } from './sketch.js';
import { METRIC_COARSE, meshBounds, RAW_LIMIT, solidMesh } from './solid.js';
import {
  contextMenu,
  download,
  el,
  fmt,
  fmtDateTime,
  helpSheet,
  icon,
  readNumber,
  safeName,
  t,
  typing,
} from './ui.js';
import { View3d } from './view3d.js';

const SAVE_DELAY = 1200;
const VERSION_EVERY = 10 * 60_000;

export function mountEditor(root, app, project) {
  const { mn, store } = app;
  let model = normalise(project.model);
  let mode = app.state.mode ?? '2d';
  const undo = [];
  const redo = [];
  let selection = [];
  let saveTimer = 0;
  let dirtySinceVersion = false;
  let lastVersion = Date.now();
  let lineStyle = 'solid';
  let preview = null; // { model, ids, reply, operations, errors }
  let aiBusy = null; // AbortController
  const chat = app.state.chats.get(project.id) ?? [];
  app.state.chats.set(project.id, chat);
  const meshes = new Map(); // solid id → polygons of an imported mesh
  const paths = new Map(); // solid id → { cut, rapid } of a toolpath
  let panelTab = 'props';
  let space = false;
  let combined = [];
  let combineTimer = 0;

  // ---------------------------------------------------------------------------------------
  // Model changes

  const units = () => store.settings.units;
  const toUnit = (mm) => (units() === 'in' ? mm / 25.4 : mm);
  const fromUnit = (v) => (units() === 'in' ? v * 25.4 : v);

  function commit(next, { record = true } = {}) {
    if (record) {
      undo.push(model);
      if (undo.length > 100) undo.shift();
      redo.length = 0;
    }
    model = next;
    // A proposal of the assistant was computed from the model before this change: drop it.
    preview = null;
    const ids = new Set([...model.sketch.entities, ...model.solids].map((x) => x.id));
    selection = selection.filter((id) => ids.has(id));
    sketch.setSelection(selection);
    scheduleSave();
    refresh();
  }

  /** Runs operations; shows what could not be applied. Returns the ids created. */
  function apply(ops, { silent = false } = {}) {
    const r = applyOps(model, ops, { meshes, names: solidNames(), mesh: currentMesh() });
    if (r.errors.length && !silent)
      window.mnui.toast(t('editor.opsSkipped', { n: r.errors.length }));
    if (r.errors.length === ops.length) return [];
    commit(r.model);
    return r.added;
  }

  /** The combined mesh when it belongs to the current solids (saves a second CSG run). */
  function currentMesh() {
    return sceneKey === `${geometryKey(model.solids)}|${[...meshes.keys()].join(',')}`
      ? combined
      : undefined;
  }

  function solidNames() {
    return {
      box: t('solid.box'),
      cylinder: t('solid.cylinder'),
      sphere: t('solid.sphere'),
      cone: t('solid.cone'),
      extrude: t('solid.extrude'),
      thread: t('solid.thread'),
    };
  }

  function doUndo() {
    if (!undo.length) return;
    redo.push(model);
    model = undo.pop();
    scheduleSave();
    refresh();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(model);
    model = redo.pop();
    scheduleSave();
    refresh();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    dirtySinceVersion = true;
    setSaveState('pending');
    saveTimer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    project.model = model;
    try {
      await store.saveProject(project);
      setSaveState('saved');
      if (dirtySinceVersion && Date.now() - lastVersion > VERSION_EVERY) await version();
    } catch {
      setSaveState('error');
    }
  }

  async function version() {
    if (!dirtySinceVersion) return;
    dirtySinceVersion = false;
    lastVersion = Date.now();
    const counts = `${t('count.lines', { n: model.sketch.entities.length })}, ${t('count.solids', { n: model.solids.length })}`;
    try {
      await store.addVersion({ ...project, model }, counts);
    } catch {
      // A missed version is not worth an error: the project itself is saved.
    }
  }

  // ---------------------------------------------------------------------------------------
  // Layout

  root.replaceChildren();
  const saveChip = el(
    'span.mn-chip.mn-chip--plain.cad-save',
    { role: 'status' },
    t('editor.saved'),
  );
  function setSaveState(s) {
    saveChip.textContent = t(
      `editor.${s === 'pending' ? 'saving' : s === 'error' ? 'saveError' : 'saved'}`,
    );
    saveChip.className = `mn-chip cad-save ${s === 'error' ? 'mn-chip--bad' : 'mn-chip--plain'}`;
  }

  const modeSeg = el('div.mn-seg', { role: 'group', 'aria-label': t('editor.mode') });
  const mode2d = el(
    'button',
    { type: 'button', 'aria-pressed': String(mode === '2d'), onclick: () => setMode('2d') },
    icon('drawing', { size: 18 }),
    t('editor.mode2d'),
  );
  const mode3d = el(
    'button',
    { type: 'button', 'aria-pressed': String(mode === '3d'), onclick: () => setMode('3d') },
    icon('cube3d', { size: 18 }),
    t('editor.mode3d'),
  );
  modeSeg.append(mode2d, mode3d);

  const iconBtn = (name, label, onclick, extra = {}) =>
    el(
      'button.mn-icon-btn',
      { type: 'button', 'aria-label': label, title: label, onclick, ...extra },
      icon(name),
    );

  const undoBtn = iconBtn('undo', t('editor.undo'), doUndo, { 'aria-keyshortcuts': 'Control+Z' });
  const redoBtn = iconBtn('redo', t('editor.redo'), doRedo, {
    'aria-keyshortcuts': 'Control+Shift+Z',
  });
  const bar = el(
    'div.cad-bar',
    {},
    modeSeg,
    el('div.cad-bar-group', {}, undoBtn, redoBtn),
    el(
      'div.cad-bar-group',
      {},
      el(
        'button.mn-btn',
        { type: 'button', onclick: () => importFile() },
        icon('import', { size: 18 }),
        t('editor.import'),
      ),
      el(
        'button.mn-btn',
        { type: 'button', onclick: () => exportSheet() },
        icon('export', { size: 18 }),
        t('editor.export'),
      ),
      el(
        'button.mn-btn',
        { type: 'button', onclick: () => viewsSheet() },
        icon('views', { size: 18 }),
        t('editor.views'),
      ),
      el(
        'button.mn-btn',
        { type: 'button', onclick: () => printDrawing() },
        icon('print', { size: 18 }),
        t('editor.print'),
      ),
      iconBtn('history', t('editor.history'), () => historySheet()),
      iconBtn('help', t('editor.help'), () =>
        helpSheet('help.editor.title', [
          'help.editor.p1',
          'help.editor.p2',
          'help.editor.p3',
          'help.editor.p4',
          'help.editor.p5',
        ]),
      ),
    ),
    saveChip,
  );

  const toolbar = el('div.cad-tools', { role: 'toolbar', 'aria-label': t('editor.tools') });
  const canvas2d = el('canvas.cad-canvas', { tabindex: '0', 'aria-label': t('editor.canvas2d') });
  const canvas3d = el('canvas.cad-canvas', { tabindex: '0', 'aria-label': t('editor.canvas3d') });
  const wrap2d = el('div.cad-canvas-wrap', {}, canvas2d);
  const wrap3d = el('div.cad-canvas-wrap', {}, canvas3d);
  const statusText = el('span.cad-status-text', { 'aria-live': 'polite' });
  const coordText = el('span.cad-coords.mn-num');
  const coordInput = el('input.cad-coord-input', {
    type: 'text',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': t('editor.coordLabel'),
    placeholder: t('editor.coordPlaceholder'),
  });
  const coordError = el('p.mn-error', { role: 'alert', hidden: true });
  coordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = coordInput.value;
      if (!text.trim()) {
        if (sketch.tool === 'poly') sketch.finishPoly(false);
        return;
      }
      const ok = sketch.typed(text);
      coordError.hidden = ok;
      coordError.textContent = ok ? '' : t('editor.coordError');
      coordInput.setAttribute('aria-invalid', String(!ok));
      if (ok) coordInput.value = '';
    } else if (e.key === 'Escape') {
      coordInput.value = '';
      sketch.cancel();
    }
  });
  const inputBar = el(
    'div.cad-inputbar',
    {},
    el('label.cad-coord', {}, el('span.mn-sr-only', {}, t('editor.coordLabel')), coordInput),
    coordText,
    statusText,
  );
  const stage2d = el('div.cad-stage', {}, wrap2d, inputBar, coordError);
  const viewBtns = el(
    'div.cad-viewbtns',
    { role: 'group', 'aria-label': t('editor.viewPresets') },
    ...['iso', 'front', 'top', 'right'].map((v) =>
      el(
        'button.mn-btn.mn-btn--ghost',
        { type: 'button', onclick: () => view3d.preset(v) },
        t(`view.${v}`),
      ),
    ),
    iconBtn('fit', t('editor.fit'), () => view3d.fitAll()),
  );
  // Fast or realistic display (shadows, reflections, materials); remembered per person.
  const renderSeg = el('div.mn-seg.cad-render', { role: 'group', 'aria-label': t('render.label') });
  const renderNote = el('p.mn-hint', { hidden: true }, t('render.unsupported'));
  const setRender = async (q, save = true) => {
    const on = view3d.ok ? view3d.setQuality(q === 'quality') : false;
    renderNote.hidden = !(q === 'quality' && !on);
    for (const b of renderSeg.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(b.dataset.q === (on ? 'quality' : 'fast')));
    if (save && store.settings.render !== q) await store.saveSettings({ render: q });
  };
  for (const q of ['fast', 'quality'])
    renderSeg.append(
      el(
        'button',
        {
          type: 'button',
          dataset: { q },
          'aria-pressed': 'false',
          title: t(`render.${q}Hint`),
          onclick: () => setRender(q),
        },
        t(`render.${q}`),
      ),
    );
  const stage3d = el(
    'div.cad-stage',
    {},
    wrap3d,
    el('div.cad-viewbar', {}, viewBtns, renderSeg),
    renderNote,
  );
  const panel = el('aside.cad-panel', { 'aria-label': t('editor.panel') });
  const work = el('div.cad-work', {}, el('div.cad-main-col', {}, toolbar, stage2d, stage3d), panel);
  root.append(bar, work);

  // ---------------------------------------------------------------------------------------
  // Canvases

  const sketch = new Sketch(canvas2d, {
    model: () => model,
    apply: (ops) => apply(ops),
    settings: () => store.settings,
    lineStyle: () => lineStyle,
    status: (text) => {
      statusText.textContent = text;
    },
    coords: (p, last) => {
      const f = (v) => fmt(toUnit(v), 3);
      coordText.textContent = last
        ? t('editor.coordsRel', {
            x: f(p[0]),
            y: f(p[1]),
            dx: f(p[0] - last[0]),
            dy: f(p[1] - last[1]),
          })
        : t('editor.coords', { x: f(p[0]), y: f(p[1]) });
    },
    selection: (ids) => {
      if (mode !== '2d') return; // the 3D view keeps its own selection
      selection = ids;
      renderPanel();
      renderTools();
    },
    askText: (p) => askText(p),
    contextMenu: (x, y) => canvasMenu(x, y),
    spaceHeld: () => space,
    unitScale: () => (units() === 'in' ? 25.4 : 1),
  });

  const view3d = new View3d(canvas3d, {
    pick: (id, add) => {
      if (!id) selection = add ? selection : [];
      else if (add)
        selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
      else selection = [id];
      updateOverlays();
      renderPanel();
      renderTools();
    },
  });
  if (!view3d.ok)
    wrap3d.append(
      el('div.mn-banner.mn-banner--warn.cad-nogl', { role: 'note' }, t('editor.noWebgl')),
    );

  function setMode(m) {
    mode = m;
    app.state.mode = m;
    mode2d.setAttribute('aria-pressed', String(m === '2d'));
    mode3d.setAttribute('aria-pressed', String(m === '3d'));
    stage2d.hidden = m !== '2d';
    stage3d.hidden = m !== '3d';
    selection = [];
    sketch.setSelection([]);
    sketch.setTool('select');
    renderTools();
    renderPanel();
    requestAnimationFrame(() => {
      if (m === '2d') sketch.resize();
      else {
        view3d.resize();
        updateScene();
      }
    });
  }

  // ---------------------------------------------------------------------------------------
  // Tool bar

  function toolButton(tool, iconName, key) {
    return el(
      'button.cad-tool',
      {
        type: 'button',
        'aria-pressed': String(sketch.tool === tool),
        'aria-label': t(`tool.${tool}`),
        title: `${t(`tool.${tool}`)} (${key.toUpperCase()})`,
        'aria-keyshortcuts': key,
        onclick: () => {
          sketch.setTool(tool);
          renderTools();
          canvas2d.focus();
        },
      },
      icon(iconName),
      el('span', {}, t(`tool.${tool}`)),
    );
  }

  function renderTools() {
    toolbar.replaceChildren();
    if (mode === '2d') {
      const tools = [
        ['select', 'select', 'v'],
        ['line', 'line', 'l'],
        ['poly', 'poly', 'p'],
        ['rect', 'rect', 'r'],
        ['circle', 'circle', 'c'],
        ['arc', 'arc', 'a'],
        ['dim', 'dim', 'd'],
        ['text', 'text', 't'],
      ];
      toolbar.append(...tools.map(([tool, ic, key]) => toolButton(tool, ic, key)));
      const styleSel = el(
        'select.cad-style',
        {
          'aria-label': t('editor.lineStyle'),
          onchange: (e) => {
            lineStyle = e.target.value;
          },
        },
        ...STYLES.map((s) =>
          el('option', { value: s, selected: s === lineStyle }, t(`style.${s}`)),
        ),
      );
      const s = store.settings;
      const toggle = (name, key, label, settingKey) =>
        el(
          'button.cad-tool.cad-tool--small',
          {
            type: 'button',
            'aria-pressed': String(Boolean(s[settingKey])),
            'aria-label': label,
            title: `${label} (${key.toUpperCase()})`,
            onclick: async () => {
              await store.saveSettings({ [settingKey]: !store.settings[settingKey] });
              renderTools();
              sketch.draw();
            },
          },
          icon(name),
        );
      toolbar.append(
        el('span.cad-tools-sep', { 'aria-hidden': 'true' }),
        el('label.cad-style-wrap', {}, el('span.mn-sr-only', {}, t('editor.lineStyle')), styleSel),
        toggle('grid', 'g', t('editor.gridSnap'), 'snapGrid'),
        toggle('magnet', 'o', t('editor.objectSnap'), 'snapObjects'),
        el(
          'button.cad-tool.cad-tool--small',
          {
            type: 'button',
            'aria-label': t('editor.fit'),
            title: `${t('editor.fit')} (F)`,
            onclick: () => sketch.fitAll(),
          },
          icon('fit'),
        ),
      );
      if (selection.length) {
        toolbar.append(
          el('span.cad-tools-sep', { 'aria-hidden': 'true' }),
          el(
            'button.cad-tool.cad-tool--small',
            {
              type: 'button',
              'aria-label': t('editor.transform'),
              title: t('editor.transform'),
              onclick: () => transformSheet(),
            },
            icon('move'),
          ),
          el(
            'button.cad-tool.cad-tool--small',
            {
              type: 'button',
              'aria-label': t('editor.duplicate'),
              title: `${t('editor.duplicate')} (Ctrl+D)`,
              onclick: () => duplicateSelection(),
            },
            icon('copy'),
          ),
          el(
            'button.cad-tool.cad-tool--small',
            {
              type: 'button',
              'aria-label': t('editor.delete'),
              title: `${t('editor.delete')} (${t('shortcuts.deleteKey')})`,
              onclick: () => deleteSelection(),
            },
            icon('trash'),
          ),
        );
      }
    } else {
      const add = (kind, ic, key) =>
        el(
          'button.cad-tool',
          {
            type: 'button',
            'aria-label': t(`add3d.${kind}`),
            title: `${t(`add3d.${kind}`)}${key ? ` (${key.toUpperCase()})` : ''}`,
            onclick: () => add3d(kind),
          },
          icon(ic),
          el('span', {}, t(`add3d.${kind}`)),
        );
      toolbar.append(
        add('box', 'box', 'b'),
        add('cylinder', 'cylinder', 'z'),
        add('hole', 'hole', 'h'),
        add('sphere', 'sphere'),
        add('cone', 'cone'),
        add('thread', 'thread', 'g'),
        add('extrude', 'extrude', 'e'),
      );
      if (selection.length)
        toolbar.append(
          el('span.cad-tools-sep', { 'aria-hidden': 'true' }),
          el(
            'button.cad-tool.cad-tool--small',
            {
              type: 'button',
              'aria-label': t('editor.duplicate'),
              title: t('editor.duplicate'),
              onclick: () => duplicateSelection(),
            },
            icon('copy'),
          ),
          el(
            'button.cad-tool.cad-tool--small',
            {
              type: 'button',
              'aria-label': t('editor.delete'),
              title: t('editor.delete'),
              onclick: () => deleteSelection(),
            },
            icon('trash'),
          ),
        );
    }
    undoBtn.disabled = !undo.length;
    redoBtn.disabled = !redo.length;
  }

  /** Puts a new solid next to the others (on the plate, right of the model). */
  function add3d(kind) {
    const b = combined.length ? meshBounds(combined) : null;
    const x = b ? Math.round(b.max[0] + 10) : 0;
    const sel = model.solids.find((s) => s.id === selection[0]);
    if (kind === 'extrude') return extrudeSheet();
    if (kind === 'thread') return threadSheet();
    if (kind === 'hole') {
      // A hole goes through the selected solid's centre, otherwise at the origin.
      const sb = sel ? meshBounds(solidMesh(sel, meshes.get(sel.id)) ?? []) : b;
      const cx = sb ? (sb.min[0] + sb.max[0]) / 2 : 0;
      const cy = sb ? (sb.min[1] + sb.max[1]) / 2 : 0;
      const z0 = sb ? sb.min[2] - 1 : -1;
      const h = sb ? sb.size[2] + 2 : 12;
      const ids = apply([
        {
          op: 'add_cylinder',
          x: round3(cx),
          y: round3(cy),
          z: round3(z0),
          r: 2.5,
          h: round3(h),
          mode: 'subtract',
          name: t('solid.hole'),
        },
      ]);
      selectOnly(ids);
      return;
    }
    const ops = {
      box: { op: 'add_box', x, y: 0, z: 0, w: 20, d: 20, h: 20 },
      cylinder: { op: 'add_cylinder', x: x + 10, y: 10, z: 0, r: 10, h: 20 },
      sphere: { op: 'add_sphere', x: x + 10, y: 10, z: 10, r: 10 },
      cone: { op: 'add_cone', x: x + 10, y: 10, z: 0, r: 10, r2: 0, h: 20 },
    }[kind];
    selectOnly(apply([ops]));
  }

  const round3 = (v) => Math.round(v * 1000) / 1000;

  function selectOnly(ids) {
    selection = ids;
    sketch.setSelection(mode === '2d' ? ids : []);
    updateOverlays();
    renderPanel();
    renderTools();
  }

  function deleteSelection() {
    if (!selection.length) return;
    const n = selection.length;
    apply(selection.map((id) => ({ op: 'delete', target: id })));
    selection = [];
    window.mnui.toast(t('editor.deleted', { n }), {
      action: { label: t('common.undo'), onClick: doUndo },
    });
  }

  function duplicateSelection() {
    if (!selection.length) return;
    const off = mode === '2d' ? { dx: 10, dy: -10 } : { dx: 10, dy: 10, dz: 0 };
    selectOnly(apply(selection.map((id) => ({ op: 'duplicate', target: id, ...off }))));
  }

  // ---------------------------------------------------------------------------------------
  // Properties panel

  const numField = (label, value, onCommit, { unit = true, suffix = null } = {}) => {
    const input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: fmt(unit ? toUnit(value) : value, 4),
      autocomplete: 'off',
    });
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const commitValue = () => {
      const v = readNumber(input.value);
      if (v === null) {
        err.hidden = false;
        err.textContent = t('editor.numberError');
        input.setAttribute('aria-invalid', 'true');
        return;
      }
      err.hidden = true;
      input.removeAttribute('aria-invalid');
      const mm = unit ? fromUnit(v) : v;
      if (Math.abs(mm - value) > 1e-12) onCommit(mm);
    };
    input.addEventListener('change', commitValue);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitValue();
      }
    });
    return el(
      'label.mn-field.cad-num',
      {},
      `${label}${suffix ? ` (${suffix})` : unit ? ` (${units()})` : ''}`,
      input,
      err,
    );
  };

  const FIELD_LABELS = {
    x1: 'field.x1',
    y1: 'field.y1',
    x2: 'field.x2',
    y2: 'field.y2',
    x: 'field.x',
    y: 'field.y',
    z: 'field.z',
    w: 'field.w',
    h: 'field.h',
    d: 'field.d',
    pitch: 'field.pitch',
    clearance: 'field.clearance',
    cx: 'field.cx',
    cy: 'field.cy',
    r: 'field.r',
    r2: 'field.r2',
    start: 'field.start',
    end: 'field.end',
    size: 'field.size',
    offset: 'field.offset',
    rx: 'field.rx',
    ry: 'field.ry',
    rz: 'field.rz',
  };
  const ANGLES = new Set(['start', 'end', 'rx', 'ry', 'rz']);

  function fieldsFor(item) {
    const f = fieldsOf(item);
    const grid = el('div.cad-fields');
    for (const [k, v] of Object.entries(f)) {
      grid.append(
        numField(
          t(item.kind === 'thread' && k === 'd' ? 'thread.diameter' : FIELD_LABELS[k]),
          v,
          (nv) => apply([{ op: 'set', target: item.id, [k]: nv }]),
          ANGLES.has(k)
            ? { unit: false, suffix: '°' }
            : item.kind === 'thread' && ['d', 'pitch', 'clearance'].includes(k)
              ? { unit: false, suffix: 'mm' }
              : {},
        ),
      );
      if (k === 'r' && item.type === 'circle')
        grid.append(
          numField(t('field.diameter'), v * 2, (nv) =>
            apply([{ op: 'set', target: item.id, r: nv / 2 }]),
          ),
        );
    }
    return grid;
  }

  function renderPanel() {
    panel.replaceChildren();
    const tabs = el('div.mn-seg.cad-panel-tabs', {
      role: 'group',
      'aria-label': t('editor.panel'),
    });
    const tabBtn = (id, label) =>
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': String(panelTab === id),
          onclick: () => {
            panelTab = id;
            renderPanel();
          },
        },
        label,
      );
    tabs.append(tabBtn('props', t('panel.props')), tabBtn('ai', t('panel.ai')));
    panel.append(tabs);
    panel.append(panelTab === 'ai' ? aiPanel() : mode === '2d' ? props2d() : props3d());
  }

  function props2d() {
    const box = el('div.cad-props');
    const items = model.sketch.entities.filter((e) => selection.includes(e.id));
    if (!items.length) {
      const b = bounds(model.sketch.entities);
      box.append(
        el(
          'div.mn-sect',
          {},
          el('h2', {}, t('props.drawing'), el('small', {}, String(model.sketch.entities.length))),
        ),
        b
          ? el(
              'dl.mn-facts',
              {},
              el(
                'div',
                {},
                el('dt', {}, t('props.extent')),
                el('dd.mn-num', {}, `${fmt(toUnit(b.w))} × ${fmt(toUnit(b.h))} ${units()}`),
              ),
            )
          : el('p.mn-note', {}, t('props.emptyDrawing')),
        el('p.mn-hint', {}, t('props.selectHint')),
      );
      return box;
    }
    if (items.length > 1) {
      box.append(
        el('div.mn-sect', {}, el('h2', {}, t('props.multi', { n: items.length }))),
        styleSelect(items),
        el(
          'button.mn-btn.mn-btn--danger.mn-btn--block',
          { type: 'button', onclick: deleteSelection },
          t('editor.delete'),
        ),
      );
      return box;
    }
    const e = items[0];
    box.append(el('div.mn-sect', {}, el('h2', {}, t(`type.${e.type}`), el('small', {}, e.id))));
    if (e.gen === 'views') box.append(el('p.mn-chip.mn-chip--plain', {}, t('props.generated')));
    box.append(fieldsFor(e));
    if (e.type === 'text') {
      const input = el('input', { type: 'text', value: e.text, maxlength: '200' });
      input.addEventListener(
        'change',
        () => input.value.trim() && apply([{ op: 'set', target: e.id, text: input.value }]),
      );
      box.append(el('label.mn-field', {}, t('field.text'), input));
    }
    if (e.type === 'dim') {
      const input = el('input', {
        type: 'text',
        value: e.label ?? '',
        maxlength: '40',
        placeholder: fmt(toUnit(dimGeometry(e).value)),
      });
      input.addEventListener('change', () =>
        apply([{ op: 'set', target: e.id, label: input.value }]),
      );
      box.append(
        el(
          'label.mn-field',
          {},
          t('field.label'),
          input,
          el('span.mn-hint', {}, t('field.labelHint')),
        ),
      );
    }
    if (e.type !== 'dim' && e.type !== 'text') box.append(styleSelect([e]));
    const facts = el('dl.mn-facts');
    if (!['text', 'dim'].includes(e.type))
      facts.append(
        el(
          'div',
          {},
          el(
            'dt',
            {},
            t(closedProfile(e) || e.type === 'circle' ? 'props.perimeter' : 'props.length'),
          ),
          el('dd.mn-num', {}, `${fmt(toUnit(length(e)), 3)} ${units()}`),
        ),
      );
    if (closedProfile(e))
      facts.append(
        el(
          'div',
          {},
          el('dt', {}, t('props.area')),
          el('dd.mn-num', {}, `${fmt(toUnit(toUnit(area(e))), 3)} ${units()}²`),
        ),
      );
    if (e.type === 'poly')
      facts.append(
        el('div', {}, el('dt', {}, t('props.points')), el('dd.mn-num', {}, String(e.pts.length))),
      );
    box.append(facts);
    if (closedProfile(e))
      box.append(
        el(
          'button.mn-btn.mn-btn--block',
          { type: 'button', onclick: () => extrudeSheet(e.id) },
          icon('extrude', { size: 18 }),
          t('props.extrude'),
        ),
      );
    box.append(
      el(
        'button.mn-btn.mn-btn--danger.mn-btn--block',
        { type: 'button', onclick: deleteSelection },
        t('editor.delete'),
      ),
    );
    return box;
  }

  function styleSelect(items) {
    const current = items.every((i) => (i.style ?? 'solid') === (items[0].style ?? 'solid'))
      ? (items[0].style ?? 'solid')
      : '';
    const sel = el(
      'select',
      {
        onchange: (ev) =>
          apply(items.map((i) => ({ op: 'set', target: i.id, style: ev.target.value }))),
      },
      current ? null : el('option', { value: '', selected: true, disabled: true }, '–'),
      ...STYLES.map((s) => el('option', { value: s, selected: s === current }, t(`style.${s}`))),
    );
    return el('label.mn-field', {}, t('editor.lineStyle'), sel);
  }

  /** Material, colour and (for prints) layer height of one solid. */
  function materialFields(s) {
    const m = materialOf(s, project.purpose);
    const set = (patch) =>
      apply([
        {
          op: 'set',
          target: s.id,
          material: cleanMaterial({
            id: m.id,
            colour: s.material?.colour,
            layer: s.material?.layer,
            ...patch,
          }),
        },
      ]);
    const sel = el(
      'select',
      { onchange: (e) => set({ id: e.target.value, colour: undefined }) },
      ...MATERIAL_IDS.map((id) =>
        el('option', { value: id, selected: id === m.id }, t(`material.${id}`)),
      ),
    );
    const colour = el('input.cad-colour', { type: 'color', value: m.colour });
    colour.addEventListener('change', () => set({ colour: colour.value }));
    const fields = el(
      'div.cad-material',
      {},
      el('label.mn-field', {}, t('material.label'), sel),
      el('label.mn-field', {}, t('material.colour'), colour),
    );
    if (m.tex === 'layers') {
      const layer = el('input', { type: 'text', inputmode: 'decimal', value: fmt(m.layer, 3) });
      layer.addEventListener('change', () => {
        const v = readNumber(layer.value);
        if (v && v >= 0.04 && v <= 1) set({ layer: v });
      });
      fields.append(el('label.mn-field', {}, `${t('material.layer')} (mm)`, layer));
    }
    return el('div', {}, fields, el('p.mn-hint', {}, t('material.hint')));
  }

  /** Derived sizes of a thread, for checking against a table. */
  function threadFacts(s) {
    const minor = s.d - 1.0825317547305482 * s.pitch;
    const pitchD = s.d - 0.649519052838329 * s.pitch;
    const f = (v) => `${fmt(toUnit(v), 3)} ${units()}`;
    return el(
      'dl.mn-facts',
      {},
      el(
        'div',
        {},
        el('dt', {}, t('thread.designation')),
        el('dd.mn-num', {}, `M${fmt(s.d, 2)}×${fmt(s.pitch, 3)}${s.left ? ' LH' : ''}`),
      ),
      el('div', {}, el('dt', {}, t('thread.pitchDiameter')), el('dd.mn-num', {}, f(pitchD))),
      el('div', {}, el('dt', {}, t('thread.minorDiameter')), el('dd.mn-num', {}, f(minor))),
      el(
        'div',
        {},
        el('dt', {}, t('thread.handed')),
        el('dd', {}, t(s.left ? 'thread.left' : 'thread.right')),
      ),
    );
  }

  function threadSheet() {
    const sel = model.solids.find((x) => x.id === selection[0] && x.op !== 'subtract');
    const sizes = Object.keys(METRIC_COARSE).map(Number);
    let internal = Boolean(sel);
    const size = el(
      'select',
      {},
      ...sizes.map((d) => el('option', { value: String(d), selected: d === 6 }, `M${fmt(d, 1)}`)),
      el('option', { value: 'custom' }, t('thread.custom')),
    );
    const dia = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: fmt(6, 3),
      disabled: true,
    });
    const pitch = el('input', { type: 'text', inputmode: 'decimal', value: fmt(1, 3) });
    const len = el('input', { type: 'text', inputmode: 'decimal', value: fmt(toUnit(16), 3) });
    const clr = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: fmt(project.purpose === 'cnc' ? 0 : 0.15, 3),
    });
    const left = el('input', { type: 'checkbox' });
    size.addEventListener('change', () => {
      const custom = size.value === 'custom';
      dia.disabled = !custom;
      if (!custom) {
        dia.value = fmt(Number(size.value), 3);
        pitch.value = fmt(METRIC_COARSE[size.value], 3);
      }
    });
    const kind = el('div.mn-seg', { role: 'group', 'aria-label': t('thread.kind') });
    for (const k of ['external', 'internal'])
      kind.append(
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String((k === 'internal') === internal),
            onclick: (e) => {
              internal = k === 'internal';
              window.mnui.select(e.currentTarget);
            },
          },
          t(`thread.${k}`),
        ),
      );
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el(
      'div.mn-form',
      {},
      el('div.mn-field', {}, t('thread.kind'), kind),
      el(
        'div.mn-grid-2',
        {},
        el('label.mn-field', {}, t('thread.size'), size),
        el('label.mn-field', {}, `${t('thread.diameter')} (mm)`, dia),
      ),
      el(
        'div.mn-grid-2',
        {},
        el('label.mn-field', {}, `${t('thread.pitch')} (mm)`, pitch),
        el('label.mn-field', {}, `${t('thread.length')} (${units()})`, len),
      ),
      el(
        'label.mn-field',
        {},
        `${t('thread.clearance')} (mm)`,
        clr,
        el('span.mn-hint', {}, t('thread.clearanceHint')),
      ),
      el('div.mn-checks', {}, el('label', {}, left, t('thread.leftHand'))),
      el('p.mn-hint', {}, t(sel ? 'thread.hintSelected' : 'thread.hint')),
      err,
    );
    const go = el('button.mn-btn.mn-btn--primary', { type: 'button' }, t('thread.go'));
    go.addEventListener('click', () => {
      const d = readNumber(dia.value);
      const p = readNumber(pitch.value);
      const l = readNumber(len.value);
      const c = readNumber(clr.value);
      if (!d || !p || !l || c === null || p > d / 4 || fromUnit(l) < 2 * p || c < 0 || c > 1) {
        err.hidden = false;
        err.textContent = t('thread.error');
        return;
      }
      const length = fromUnit(l);
      let pos;
      if (sel) {
        // Through the centre of the selected part, from 1 mm below to 1 mm above it.
        const b = partMesh(sel)?.bounds;
        pos = b
          ? [
              (b.min[0] + b.max[0]) / 2,
              (b.min[1] + b.max[1]) / 2,
              internal ? b.min[2] - 1 : b.max[2],
            ]
          : [0, 0, 0];
      } else {
        const b = combined.length ? meshBounds(combined) : null;
        pos = [
          b ? Math.round(b.max[0] + 10 + d / 2) : 0,
          b ? Math.round((b.min[1] + b.max[1]) / 2) : 0,
          0,
        ];
      }
      const h =
        sel && internal ? Math.max(length, (partMesh(sel)?.bounds.size[2] ?? 0) + 2) : length;
      const ids = apply([
        {
          op: 'add_thread',
          x: round3(pos[0]),
          y: round3(pos[1]),
          z: round3(pos[2]),
          d,
          pitch: p,
          h: round3(h),
          clearance: c,
          left: left.checked,
          mode: internal ? 'subtract' : 'add',
        },
      ]);
      window.mnui.sheet.close();
      if (ids.length) {
        selectOnly(ids);
        window.mnui.toast(t('thread.done'));
      }
    });
    sheetFrame('thread.title', form, go, { tall: true });
  }

  function props3d() {
    const box = el('div.cad-props');
    const items = model.solids.filter((s) => selection.includes(s.id));
    if (items.length === 1) {
      const s = items[0];
      const name = el('input', { type: 'text', value: s.name, maxlength: '80' });
      name.addEventListener(
        'change',
        () => name.value.trim() && apply([{ op: 'set', target: s.id, name: name.value }]),
      );
      box.append(
        el('div.mn-sect', {}, el('h2', {}, t(`solid.${s.kind}`), el('small', {}, s.id))),
        el('label.mn-field', {}, t('field.name'), name),
      );
      if (s.kind !== 'toolpath') {
        const seg = el('div.mn-seg', { role: 'group', 'aria-label': t('props.mode') });
        for (const m of ['add', 'subtract'])
          seg.append(
            el(
              'button',
              {
                type: 'button',
                'aria-pressed': String(s.op === m),
                onclick: () => apply([{ op: 'set', target: s.id, mode: m }]),
              },
              t(`props.mode.${m}`),
            ),
          );
        box.append(el('div.mn-field', {}, t('props.mode'), seg));
      }
      box.append(fieldsFor(s));
      if (s.kind === 'thread') box.append(threadFacts(s));
      if (s.kind !== 'toolpath' && s.op !== 'subtract') box.append(materialFields(s));
      if (s.kind === 'mesh') box.append(el('p.mn-hint', {}, t('props.meshInfo', { n: s.tris })));
      if (s.kind === 'toolpath') {
        box.append(el('p.mn-hint', {}, t('props.toolpathInfo')));
        box.append(
          el(
            'button.mn-btn.mn-btn--block',
            { type: 'button', onclick: () => toolpathToSketch(s) },
            t('props.toolpathToSketch'),
          ),
        );
      }
      box.append(
        el(
          'button.mn-btn.mn-btn--block',
          { type: 'button', onclick: () => commit(toggleHidden(s.id)) },
          icon(s.hidden ? 'eye' : 'eyeOff', { size: 18 }),
          t(s.hidden ? 'props.show' : 'props.hide'),
        ),
        el(
          'button.mn-btn.mn-btn--danger.mn-btn--block',
          { type: 'button', onclick: deleteSelection },
          t('editor.delete'),
        ),
      );
      return box;
    }
    // The model: statistics, print checks and the list of solids.
    box.append(stats3d());
    box.append(
      el(
        'div.mn-sect',
        {},
        el('h2', {}, t('props.solids'), el('small', {}, String(model.solids.length))),
      ),
    );
    if (!model.solids.length) {
      box.append(el('p.mn-note', {}, t('props.noSolids')));
      return box;
    }
    const list = el('div.mn-list.cad-solid-list');
    for (const s of model.solids) {
      list.append(
        el(
          'button.mn-row',
          {
            type: 'button',
            'aria-pressed': String(selection.includes(s.id)),
            onclick: (ev) => view3dHost(s.id, ev.shiftKey),
          },
          el(
            'span.mn-thumb',
            { 'aria-hidden': 'true' },
            icon(
              s.op === 'subtract'
                ? 'hole'
                : s.kind === 'mesh'
                  ? 'cube3d'
                  : s.kind === 'toolpath'
                    ? 'poly'
                    : s.kind === 'extrude'
                      ? 'extrude'
                      : s.kind,
            ),
          ),
          el(
            'span',
            {},
            el('span.mn-row-title', {}, s.name),
            el(
              'span.mn-row-sub',
              {},
              `${t(`solid.${s.kind}`)} · ${s.id}${s.hidden ? ` · ${t('props.hidden')}` : ''}`,
            ),
          ),
          el(
            'span.mn-row-side',
            {},
            el(
              'span',
              { class: `mn-chip ${s.op === 'subtract' ? 'mn-chip--warn' : 'mn-chip--plain'}` },
              t(`props.mode.${s.op ?? 'add'}`),
            ),
          ),
        ),
      );
    }
    box.append(list);
    return box;
  }

  function view3dHost(id, add) {
    selection = add
      ? selection.includes(id)
        ? selection.filter((x) => x !== id)
        : [...selection, id]
      : [id];
    updateOverlays();
    renderPanel();
    renderTools();
  }

  function toggleHidden(id) {
    const m = structuredClone(model);
    const s = m.solids.find((x) => x.id === id);
    s.hidden = !s.hidden;
    return m;
  }

  function stats3d() {
    const wrap = el('div.cad-stats');
    wrap.append(el('div.mn-sect', {}, el('h2', {}, t('props.model'))));
    const b = stats && combined.length ? meshBounds(combined) : null;
    if (!b) {
      wrap.append(
        el('p.mn-note', {}, t(model.solids.length ? 'props.computing' : 'props.noSolids')),
      );
      return wrap;
    }
    const vol = stats.volume / 1000; // cm³
    const p = store.settings.printer;
    const fits = b.size[0] <= p.x && b.size[1] <= p.y && b.size[2] <= p.z;
    const open = stats.open;
    const over = stats.overhang / 100; // cm²
    wrap.append(
      el(
        'dl.mn-facts',
        {},
        el(
          'div',
          {},
          el('dt', {}, t('props.size')),
          el(
            'dd.mn-num',
            {},
            `${fmt(toUnit(b.size[0]))} × ${fmt(toUnit(b.size[1]))} × ${fmt(toUnit(b.size[2]))} ${units()}`,
          ),
        ),
        el('div', {}, el('dt', {}, t('props.volume')), el('dd.mn-num', {}, `${fmt(vol, 2)} cm³`)),
        el(
          'div',
          {},
          el('dt', {}, t('props.weight')),
          el(
            'dd.mn-num',
            {},
            t('props.weightValue', { g: fmt(vol * p.density, 1), density: fmt(p.density, 2) }),
          ),
        ),
      ),
      el(
        'div.mn-chips.cad-checks',
        {},
        el(
          `span.mn-chip.${fits ? 'mn-chip--ok' : 'mn-chip--bad'}`,
          {},
          t(fits ? 'check.fits' : 'check.tooBig', { x: p.x, y: p.y, z: p.z }),
        ),
        b.min[2] < -1e-6 ? el('span.mn-chip.mn-chip--warn', {}, t('check.belowPlate')) : null,
        open ? el('span.mn-chip.mn-chip--warn', {}, t('check.open', { n: open })) : null,
        over > 0.01
          ? el('span.mn-chip.mn-chip--warn', {}, t('check.overhang', { a: fmt(over, 1) }))
          : el('span.mn-chip.mn-chip--ok', {}, t('check.noOverhang')),
      ),
    );
    return wrap;
  }

  // ---------------------------------------------------------------------------------------
  // 3D scene

  // The scene is built in a worker (CSG and smooth normals off the page) and cached by geometry;
  // without workers it is built here. Material changes only recolour, nothing is rebuilt.
  let sceneJob = 0;
  let sceneKey = '';
  let stats = null;
  const sentMeshes = new Set();
  let worker = null;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  const pending = new Map();
  worker?.addEventListener('message', (e) => {
    const done = pending.get(e.data.job);
    pending.delete(e.data.job);
    done?.(e.data);
  });
  worker?.addEventListener('error', () => {
    worker = null;
    for (const done of pending.values()) done({ error: 'worker' });
    pending.clear();
  });
  function build(solids) {
    if (!worker) return Promise.resolve(buildScene(solids, meshes));
    for (const [id, polys] of meshes)
      if (!sentMeshes.has(id)) {
        worker.postMessage({ type: 'mesh', id, polys });
        sentMeshes.add(id);
      }
    const job = ++sceneJob;
    return new Promise((resolve) => {
      pending.set(job, (r) => resolve(r.error ? buildScene(solids, meshes) : r));
      worker.postMessage({ type: 'build', job, solids });
    });
  }

  const partCache = new Map();
  /** The placed mesh of one solid (for picking and overlays), cached by its geometry. */
  function partMesh(s) {
    const key = geometryKey([s]);
    let hit = partCache.get(key);
    if (!hit) {
      const mesh = solidMesh(s, meshes.get(s.id) ?? null);
      hit = mesh ? { mesh, bounds: meshBounds(mesh) } : null;
      partCache.set(key, hit);
      if (partCache.size > 200) partCache.delete(partCache.keys().next().value);
    }
    return hit;
  }

  function materialsOf(m) {
    return new Map(m.solids.map((x) => [x.id, materialOf(x, project.purpose)]));
  }

  function updateOverlays() {
    const m = preview?.model ?? model;
    const solids = new Map();
    for (const x of m.solids) {
      if (x.hidden || x.kind === 'toolpath') continue;
      const part = partMesh(x);
      if (part && part.mesh.length <= RAW_LIMIT * 2) solids.set(x.id, { ...part, op: x.op });
    }
    view3d.setOverlays({ solids, selected: selection, preview: preview?.ids ?? [] });
  }

  function updateScene() {
    clearTimeout(combineTimer);
    combineTimer = setTimeout(async () => {
      const m = preview?.model ?? model;
      const key = `${geometryKey(m.solids)}|${[...meshes.keys()].join(',')}`;
      const mats = materialsOf(m);
      updateOverlays();
      if (key === sceneKey) {
        view3d.setMaterials(mats);
        return;
      }
      const job = sceneJob + 1;
      const r = await build(m.solids);
      // A newer change started meanwhile: its result follows.
      if (worker && job !== sceneJob) return;
      sceneKey = key;
      combined = r.mesh;
      stats = r.stats;
      const ps = m.solids
        .filter((x) => x.kind === 'toolpath' && !x.hidden && paths.has(x.id))
        .map((x) => {
          const p = paths.get(x.id);
          const move = (q) => [q[0] + x.pos[0], q[1] + x.pos[1], q[2] + x.pos[2]];
          return {
            cut: p.cut.map((l) => l.map(move)),
            rapid: p.rapid.map(([a, b]) => [move(a), move(b)]),
          };
        });
      const fallback = materialOf({}, project.purpose);
      view3d.setModel({
        groups: r.groups.map((g) => ({ ...g, material: mats.get(g.id) ?? fallback })),
        bounds: r.bounds,
        paths: ps,
      });
      if (!app.state.fitted3d?.has(project.id)) {
        app.state.fitted3d ??= new Set();
        app.state.fitted3d.add(project.id);
        view3d.fitAll();
      }
      if (mode === '3d' && panelTab === 'props' && !selection.length) renderPanel();
    }, 60);
  }

  async function loadFiles() {
    for (const s of model.solids) {
      if (!s.file || meshes.has(s.id) || paths.has(s.id)) continue;
      try {
        const data = await store.loadFile(s);
        if (s.kind === 'mesh') meshes.set(s.id, data);
        else paths.set(s.id, data);
      } catch {
        window.mnui.toast(t('editor.fileLoadError', { name: s.name }));
      }
    }
    updateScene();
  }

  function refresh() {
    sketch.preview = preview ? { model: preview.model, ids: preview.ids } : null;
    sketch.draw();
    updateScene();
    renderTools();
    renderPanel();
    app.setSubtitle(
      `${t('count.lines', { n: model.sketch.entities.length })} · ${t('count.solids', { n: model.solids.length })}`,
    );
  }

  // ---------------------------------------------------------------------------------------
  // Sheets: text, extrude, transform, views, export, history

  function sheetFrame(titleKey, body, foot, { tall = false } = {}) {
    const node = el(
      'div',
      {},
      el(
        'div.mn-sheet-bar',
        {},
        el(
          'button.mn-btn.mn-btn--ghost',
          { type: 'button', 'data-mn-close': '' },
          t('common.cancel'),
        ),
        el('h2', {}, t(titleKey)),
        el('span'),
      ),
      el('div.mn-sheet-body', {}, body),
      foot ? el('div.mn-sheet-foot', {}, el('span.mn-grow'), foot) : null,
    );
    return window.mnui.sheet.open(node, { tall });
  }

  function askText(p) {
    const input = el('input', { type: 'text', maxlength: '200', required: true });
    const size = el('input', { type: 'text', inputmode: 'decimal', value: fmt(toUnit(3.5)) });
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el(
      'form.mn-form',
      { novalidate: true },
      el('label.mn-field', {}, t('field.text'), input),
      el('label.mn-field', {}, `${t('field.size')} (${units()})`, size),
      err,
    );
    const ok = el('button.mn-btn.mn-btn--primary', { type: 'submit' }, t('common.add'));
    form.append(ok);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = readNumber(size.value);
      if (!input.value.trim() || !s || s <= 0) {
        err.hidden = false;
        err.textContent = t('editor.textError');
        return;
      }
      apply([{ op: 'add_text', x: p[0], y: p[1], text: input.value.trim(), size: fromUnit(s) }]);
      window.mnui.sheet.close();
    });
    sheetFrame('sheet.text', form);
    input.focus();
  }

  function extrudeSheet(targetId) {
    const shapes = model.sketch.entities.filter((e) => closedProfile(e) && e.gen !== 'views');
    if (!shapes.length) {
      helpSheet('extrude.noneTitle', ['extrude.none1', 'extrude.none2']);
      return;
    }
    const sel = el(
      'select',
      {},
      ...shapes.map((e) =>
        el(
          'option',
          { value: e.id, selected: e.id === (targetId ?? selection[0]) },
          `${e.id} · ${t(`type.${e.type}`)}`,
        ),
      ),
    );
    const h = el('input', { type: 'text', inputmode: 'decimal', value: fmt(toUnit(10)) });
    const z = el('input', { type: 'text', inputmode: 'decimal', value: '0' });
    const modeSel = el(
      'select',
      {},
      el('option', { value: 'add' }, t('props.mode.add')),
      el('option', { value: 'subtract' }, t('props.mode.subtract')),
    );
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el(
      'form.mn-form',
      { novalidate: true },
      el('label.mn-field', {}, t('extrude.shape'), sel),
      el(
        'div.mn-grid-2',
        {},
        el('label.mn-field', {}, `${t('field.h')} (${units()})`, h),
        el('label.mn-field', {}, `${t('field.z')} (${units()})`, z),
      ),
      el('label.mn-field', {}, t('props.mode'), modeSel),
      err,
    );
    const go = el('button.mn-btn.mn-btn--primary', { type: 'button' }, t('extrude.go'));
    go.addEventListener('click', () => {
      const hv = readNumber(h.value);
      const zv = readNumber(z.value);
      if (!hv || hv <= 0 || zv === null) {
        err.hidden = false;
        err.textContent = t('editor.numberError');
        return;
      }
      const ids = apply([
        { op: 'extrude', target: sel.value, h: fromUnit(hv), z: fromUnit(zv), mode: modeSel.value },
      ]);
      window.mnui.sheet.close();
      if (ids.length) {
        setMode('3d');
        selectOnly(ids);
        window.mnui.toast(t('extrude.done'));
      }
    });
    sheetFrame('extrude.title', form, go);
  }

  function transformSheet() {
    const items = model.sketch.entities.filter((e) => selection.includes(e.id));
    if (!items.length) return;
    const b = bounds(items);
    const centre = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    let kind = 'move';
    const body = el('div');
    const seg = el('div.mn-seg', { role: 'group', 'aria-label': t('transform.kind') });
    const kinds = ['move', 'rotate', 'mirror', 'array'];
    const fields = {};
    const num = (key, label, value, unit = true) => {
      const input = el('input', {
        type: 'text',
        inputmode: 'decimal',
        value: fmt(unit ? toUnit(value) : value, 4),
      });
      fields[key] = { input, unit };
      return el('label.mn-field', {}, `${label}${unit ? ` (${units()})` : ''}`, input);
    };
    const copy = el('input', { type: 'checkbox' });
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el('div.mn-form');
    const draw = () => {
      for (const k of Object.keys(fields)) delete fields[k];
      form.replaceChildren();
      if (kind === 'move')
        form.append(
          el('div.mn-grid-2', {}, num('dx', t('field.dx'), 0), num('dy', t('field.dy'), 0)),
        );
      if (kind === 'rotate')
        form.append(
          num('angle', `${t('field.angle')} (°)`, 90, false),
          el(
            'div.mn-grid-2',
            {},
            num('cx', t('field.cx'), centre[0]),
            num('cy', t('field.cy'), centre[1]),
          ),
        );
      if (kind === 'mirror') {
        const axis = el(
          'select',
          {},
          el('option', { value: 'y' }, t('transform.axisV')),
          el('option', { value: 'x' }, t('transform.axisH')),
        );
        fields.axis = { select: axis };
        form.append(
          el('label.mn-field', {}, t('transform.axis'), axis),
          el(
            'div.mn-grid-2',
            {},
            num('cx', t('field.cx'), centre[0]),
            num('cy', t('field.cy'), centre[1]),
          ),
        );
      }
      if (kind === 'array')
        form.append(
          el(
            'div.mn-grid-2',
            {},
            num('cols', t('transform.cols'), 3, false),
            num('rows', t('transform.rows'), 1, false),
          ),
          el(
            'div.mn-grid-2',
            {},
            num('dx', t('field.dx'), Math.max(b.w, 1) + 5),
            num('dy', t('field.dy'), Math.max(b.h, 1) + 5),
          ),
        );
      if (kind !== 'array')
        form.append(
          el(
            'div.mn-checks',
            {},
            el('label', {}, copy, t(kind === 'mirror' ? 'transform.keep' : 'transform.copy')),
          ),
        );
      form.append(err);
    };
    for (const k of kinds) {
      seg.append(
        el(
          'button',
          {
            type: 'button',
            'aria-pressed': String(k === kind),
            onclick: (ev) => {
              kind = k;
              window.mnui.select(ev.currentTarget);
              draw();
            },
          },
          t(`transform.${k}`),
        ),
      );
    }
    draw();
    body.append(seg, form);
    const go = el('button.mn-btn.mn-btn--primary', { type: 'button' }, t('transform.apply'));
    go.addEventListener('click', () => {
      const v = {};
      for (const [k, f] of Object.entries(fields)) {
        if (f.select) {
          v[k] = f.select.value;
          continue;
        }
        const n = readNumber(f.input.value);
        if (n === null) {
          err.hidden = false;
          err.textContent = t('editor.numberError');
          return;
        }
        v[k] = f.unit ? fromUnit(n) : n;
      }
      const ids = items.map((i) => i.id);
      let r;
      if (kind === 'move')
        r = applyOps(
          model,
          ids.map((id) => ({
            op: copy.checked ? 'duplicate' : 'move',
            target: id,
            dx: v.dx,
            dy: v.dy,
          })),
        );
      else if (kind === 'array') {
        const cols = Math.max(1, Math.min(50, Math.round(v.cols)));
        const rows = Math.max(1, Math.min(50, Math.round(v.rows)));
        const ops = [];
        for (let i = 0; i < cols; i++)
          for (let j = 0; j < rows; j++)
            if (i || j)
              for (const id of ids)
                ops.push({ op: 'duplicate', target: id, dx: v.dx * i, dy: v.dy * j });
        r = applyOps(model, ops);
      } else {
        // Rotate or mirror, on copies when asked: duplicate first, then turn the new ids.
        let base = model;
        let targets = ids;
        if (copy.checked) {
          const d = applyOps(
            model,
            ids.map((id) => ({ op: 'duplicate', target: id })),
          );
          base = d.model;
          targets = d.added;
        }
        r = applyOps(
          base,
          targets.map((id) =>
            kind === 'rotate'
              ? { op: 'rotate', target: id, angle: v.angle, cx: v.cx, cy: v.cy }
              : { op: 'mirror', target: id, axis: v.axis, cx: v.cx, cy: v.cy },
          ),
        );
      }
      if (r.errors.length) window.mnui.toast(t('editor.opsSkipped', { n: r.errors.length }));
      commit(r.model);
      window.mnui.sheet.close();
      window.mnui.toast(t('transform.done'));
    });
    sheetFrame('transform.title', body, go);
  }

  function viewsSheet() {
    if (!model.solids.some((s) => !s.hidden && s.kind !== 'toolpath')) {
      helpSheet('views.noneTitle', ['views.none1', 'views.none2']);
      return;
    }
    const checks = el('div.mn-checks');
    const boxes = {};
    for (const v of ['front', 'top', 'left', 'right', 'iso']) {
      boxes[v] = el('input', {
        type: 'checkbox',
        checked: ['front', 'top', 'left', 'iso'].includes(v),
      });
      checks.append(el('label', {}, boxes[v], t(`view.${v}`)));
    }
    const method = el(
      'select',
      {},
      el(
        'option',
        { value: 'first', selected: store.settings.projection === 'first' },
        t('views.first'),
      ),
      el(
        'option',
        { value: 'third', selected: store.settings.projection === 'third' },
        t('views.third'),
      ),
    );
    const hidden = el('input', { type: 'checkbox', checked: store.settings.showHidden });
    const dims = el('input', { type: 'checkbox', checked: true });
    const form = el(
      'div.mn-form',
      {},
      el('fieldset', {}, el('legend', {}, t('views.which')), checks),
      el('label.mn-field', {}, t('views.method'), method),
      el(
        'div.mn-checks',
        {},
        el('label', {}, hidden, t('views.hidden')),
        el('label', {}, dims, t('views.dims')),
      ),
      el('p.mn-hint', {}, t('views.hint')),
    );
    const go = el('button.mn-btn.mn-btn--primary', { type: 'button' }, t('views.go'));
    go.addEventListener('click', () => {
      const views = Object.entries(boxes)
        .filter(([, b]) => b.checked)
        .map(([v]) => v);
      if (!views.length) return;
      go.disabled = true;
      go.textContent = t('views.working');
      // Let the button state paint before the (synchronous) projection runs.
      setTimeout(() => {
        const ids = apply([
          {
            op: 'generate_views',
            views,
            method: method.value,
            hidden: hidden.checked,
            dims: dims.checked,
          },
        ]);
        window.mnui.sheet.close();
        if (ids.length) {
          setMode('2d');
          sketch.fitAll();
          window.mnui.toast(t('views.done'));
        }
      }, 30);
    });
    sheetFrame('views.title', form, go);
  }

  function exportSheet() {
    const name = safeName(project.name);
    const row = (titleKey, subKey, onClick, disabled = false) =>
      el(
        'button.mn-row',
        { type: 'button', onclick: onClick, disabled },
        el(
          'span',
          {},
          el('span.mn-row-title', {}, t(titleKey)),
          el('span.mn-row-sub', {}, t(subKey)),
        ),
      );
    const has2d = model.sketch.entities.length > 0;
    const has3d = combined.length > 0;
    const done = (key) => {
      window.mnui.sheet.close();
      window.mnui.toast(t('export.done', { file: key }));
    };
    const list = el(
      'div.mn-list',
      {},
      row(
        'export.stl',
        'export.stlSub',
        () => {
          download(
            new Blob([writeStl(combined, project.name)], { type: 'model/stl' }),
            `${name}.stl`,
          );
          done(`${name}.stl`);
        },
        !has3d,
      ),
      row(
        'export.obj',
        'export.objSub',
        () => {
          download(new Blob([writeObj(combined)], { type: 'text/plain' }), `${name}.obj`);
          done(`${name}.obj`);
        },
        !has3d,
      ),
      row(
        'export.dxf',
        'export.dxfSub',
        () => {
          download(
            new Blob([writeDxf(model.sketch.entities)], { type: 'application/dxf' }),
            `${name}.dxf`,
          );
          done(`${name}.dxf`);
        },
        !has2d,
      ),
      row(
        'export.svg',
        'export.svgSub',
        () => {
          download(
            new Blob([writeSvg(model.sketch.entities, { num: (v) => fmt(v, 2) })], {
              type: 'image/svg+xml',
            }),
            `${name}.svg`,
          );
          done(`${name}.svg`);
        },
        !has2d,
      ),
      row('export.gcode', 'export.gcodeSub', () => gcodeSheet(), !has2d),
      row(
        'export.pdf',
        'export.pdfSub',
        () => {
          window.mnui.sheet.close();
          printDrawing();
        },
        !has2d,
      ),
    );
    sheetFrame(
      'export.title',
      el('div', {}, list, has2d && has3d ? null : el('p.mn-hint', {}, t('export.hint'))),
    );
  }

  function gcodeSheet() {
    const c = { ...store.settings.cam };
    const fields = {};
    const num = (k, label, unit = true) => {
      const input = el('input', {
        type: 'text',
        inputmode: 'decimal',
        value: fmt(unit ? toUnit(c[k]) : c[k], 4),
      });
      fields[k] = { input, unit };
      return el('label.mn-field', {}, `${label}${unit ? ` (${units()})` : ''}`, input);
    };
    const side = el(
      'select',
      {},
      ...['outside', 'inside', 'on'].map((s) =>
        el('option', { value: s, selected: c.side === s }, t(`cam.side.${s}`)),
      ),
    );
    const onlySel = el('input', {
      type: 'checkbox',
      checked: selection.length > 0,
      disabled: !selection.length,
    });
    const err = el('p.mn-error', { role: 'alert', hidden: true });
    const form = el(
      'div.mn-form',
      {},
      el(
        'div.mn-grid-2',
        {},
        num('tool', t('cam.tool')),
        el('label.mn-field', {}, t('cam.side'), side),
      ),
      el('div.mn-grid-2', {}, num('depth', t('cam.depth')), num('step', t('cam.step'))),
      el(
        'div.mn-grid-2',
        {},
        num('feed', t('cam.feed'), false),
        num('plunge', t('cam.plunge'), false),
      ),
      el('div.mn-grid-2', {}, num('safeZ', t('cam.safeZ')), num('rpm', t('cam.rpm'), false)),
      el('div.mn-checks', {}, el('label', {}, onlySel, t('cam.onlySelection'))),
      el('p.mn-hint', {}, t('cam.hint')),
      err,
    );
    const go = el('button.mn-btn.mn-btn--primary', { type: 'button' }, t('cam.go'));
    go.addEventListener('click', async () => {
      const o = { side: side.value };
      for (const [k, f] of Object.entries(fields)) {
        const v = readNumber(f.input.value);
        if (
          v === null ||
          v < 0 ||
          (['tool', 'depth', 'step', 'feed', 'plunge'].includes(k) && v <= 0)
        ) {
          err.hidden = false;
          err.textContent = t('cam.error');
          return;
        }
        o[k] = f.unit ? fromUnit(v) : v;
      }
      await store.saveSettings({ cam: o });
      const ents = model.sketch.entities.filter((e) =>
        onlySel.checked ? selection.includes(e.id) : e.gen !== 'views',
      );
      const code = writeGcode(ents, o);
      const name = `${safeName(project.name)}.nc`;
      download(new Blob([code], { type: 'text/plain' }), name);
      window.mnui.sheet.close();
      window.mnui.toast(t('export.done', { file: name }));
    });
    sheetFrame('cam.title', form, go, { tall: true });
  }

  async function historySheet() {
    await save();
    await version();
    const body = el('div', {}, el('span.mn-sk', { style: { height: '56px' } }));
    sheetFrame('history.title', body, null, { tall: true });
    let versions;
    try {
      versions = await store.versions(project.id);
    } catch {
      body.replaceChildren(
        el('p.mn-error', { role: 'alert' }, t('common.loadError')),
        el('button.mn-btn', { type: 'button', onclick: () => historySheet() }, t('common.retry')),
      );
      return;
    }
    body.replaceChildren(el('p.mn-hint', {}, t('history.hint')));
    if (!versions.length) {
      body.append(
        el(
          'div.mn-empty',
          {},
          el('h3', {}, t('history.empty')),
          el('p', {}, t('history.emptyText')),
        ),
      );
      return;
    }
    const list = el('div.mn-list');
    for (const v of versions) {
      list.append(
        el(
          'div.mn-row.mn-row--text',
          {},
          el(
            'span',
            {},
            el('span.mn-row-title', {}, fmtDateTime(v.at)),
            el('span.mn-row-sub', {}, v.changes?.summary ?? ''),
          ),
          el(
            'span.mn-row-side',
            {},
            el(
              'button.mn-btn',
              {
                type: 'button',
                onclick: () => {
                  if (!v.changes?.model) return;
                  commit(normalise(v.changes.model));
                  window.mnui.sheet.close();
                  window.mnui.toast(t('history.restored'), {
                    action: { label: t('common.undo'), onClick: doUndo },
                  });
                },
              },
              t('history.restore'),
            ),
          ),
        ),
      );
    }
    body.append(list);
  }

  function printDrawing() {
    save().then(() => app.go({ print: project.id }));
  }

  // ---------------------------------------------------------------------------------------
  // Import

  function importFile() {
    const input = el('input', {
      type: 'file',
      accept: '.stl,.obj,.dxf,.gcode,.nc,.ngc,.tap,.cnc',
      hidden: true,
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (file) await importOne(file);
    });
    document.body.append(input);
    input.click();
  }

  async function importOne(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (file.size > 60 * 1024 * 1024) {
      window.mnui.toast(t('import.tooLarge'));
      return;
    }
    try {
      if (ext === 'dxf') {
        const { entities, skipped } = readDxf(await file.text(), () => 'x');
        const ops = entities.map(dxfToOp).filter(Boolean);
        const ids = apply(ops);
        setMode('2d');
        sketch.fitAll();
        selectOnly(ids);
        window.mnui.toast(
          skipped
            ? t('import.dxfSkipped', { n: ids.length, skipped })
            : t('import.dxfDone', { n: ids.length }),
        );
        return;
      }
      if (!mn.offline.online()) {
        window.mnui.toast(t('import.offline'));
        return;
      }
      if (ext === 'stl' || ext === 'obj') {
        const polys =
          ext === 'stl' ? readStl(await file.arrayBuffer()) : readObj(await file.text());
        const draft = structuredClone(model);
        const id = nextId(draft, 's');
        const path = store.filePath(project.id, id, 'stl');
        await store.uploadFile(path, new Blob([writeStl(polys)], { type: 'model/stl' }));
        store.cache(path, polys);
        meshes.set(id, polys);
        const b = meshBounds(polys);
        // Imported parts stand on the plate at the origin.
        draft.solids.push({
          id,
          kind: 'mesh',
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 80),
          op: 'add',
          pos: [-b.min[0], -b.min[1], -b.min[2]],
          rot: [0, 0, 0],
          file: path,
          tris: polys.length,
        });
        commit(draft);
        setMode('3d');
        selectOnly([id]);
        view3d.fitAll();
        window.mnui.toast(t('import.meshDone', { n: fmt(polys.length, 0) }));
        return;
      }
      // G-code
      const text = await file.text();
      const moves = readGcode(text);
      const draft = structuredClone(model);
      const id = nextId(draft, 's');
      const path = store.filePath(project.id, id, 'nc');
      await store.uploadFile(path, new Blob([text], { type: 'text/plain' }));
      store.cache(path, moves);
      paths.set(id, moves);
      draft.solids.push({
        id,
        kind: 'toolpath',
        name: file.name.slice(0, 80),
        op: 'add',
        pos: [0, 0, 0],
        rot: [0, 0, 0],
        file: path,
      });
      commit(draft);
      setMode('3d');
      selectOnly([id]);
      view3d.fitAll();
      window.mnui.toast(t('import.gcodeDone', { n: moves.cut.length }));
    } catch (err) {
      const code =
        err?.message === 'too_large'
          ? 'import.tooLarge'
          : err?.message === 'invalid'
            ? 'import.invalid'
            : 'import.failed';
      window.mnui.toast(t(code));
    }
  }

  function dxfToOp(e) {
    const deg = (r) => (r * 180) / Math.PI;
    switch (e.type) {
      case 'line':
        return { op: 'add_line', x1: e.a[0], y1: e.a[1], x2: e.b[0], y2: e.b[1] };
      case 'circle':
        return { op: 'add_circle', cx: e.c[0], cy: e.c[1], r: e.r };
      case 'arc':
        return {
          op: 'add_arc',
          cx: e.c[0],
          cy: e.c[1],
          r: e.r,
          start: deg(e.start),
          end: deg(e.end),
        };
      case 'poly':
        return { op: 'add_polyline', points: e.pts.map(([x, y]) => ({ x, y })), closed: e.closed };
      case 'text':
        return { op: 'add_text', x: e.p[0], y: e.p[1], text: e.text, size: e.size };
      default:
        return null;
    }
  }

  function toolpathToSketch(s) {
    const p = paths.get(s.id);
    if (!p) return;
    // Every cutting chain becomes a polyline in XY (simplified to at most 2000 points).
    const ops = p.cut
      .filter((l) => l.length >= 2)
      .map((l) => {
        const step = Math.ceil(l.length / 2000);
        const pts = l
          .filter((_, i) => i % step === 0 || i === l.length - 1)
          .map((q) => ({ x: q[0] + s.pos[0], y: q[1] + s.pos[1] }));
        return { op: 'add_polyline', points: pts, closed: false };
      });
    const ids = apply(ops);
    setMode('2d');
    sketch.fitAll();
    window.mnui.toast(t('import.toolpathToSketch', { n: ids.length }));
  }

  // ---------------------------------------------------------------------------------------
  // Assistant

  function aiPanel() {
    const box = el('div.cad-ai');
    box.append(el('p.mn-hint', {}, t('ai.intro')));
    const log = el('div.cad-ai-log', { 'aria-live': 'polite' });
    for (const m of chat)
      log.append(
        el(
          `div.cad-ai-msg.cad-ai-msg--${m.role}`,
          {},
          el('span.mn-sr-only', {}, t(m.role === 'user' ? 'ai.you' : 'ai.assistant')),
          m.text,
        ),
      );
    box.append(log);
    if (aiBusy) {
      box.append(
        el('span.mn-sk', { style: { height: '56px' } }),
        el(
          'button.mn-btn.mn-btn--block',
          { type: 'button', onclick: () => aiBusy?.abort() },
          icon('stop', { size: 18 }),
          t('ai.cancel'),
        ),
      );
      return box;
    }
    if (preview) {
      const card = el('div.cad-ai-proposal');
      card.append(el('span.mn-chip.mn-chip--plain', {}, t('ai.proposal')));
      card.append(
        el('p', {}, t('ai.opsCount', { n: preview.operations.length - preview.errors.length })),
      );
      const ul = el('ul.cad-ai-ops');
      preview.operations.forEach((o, i) => {
        const failed = preview.errors.find((e) => e.index === i);
        ul.append(
          el(
            'li',
            { class: failed ? 'cad-ai-op--bad' : '' },
            describeOp(o),
            failed ? ` · ${t(`opError.${failed.code}`)}` : '',
          ),
        );
      });
      card.append(ul);
      card.append(
        el(
          'div.cad-ai-actions',
          {},
          el(
            'button.mn-btn.mn-btn--ghost',
            {
              type: 'button',
              onclick: () => {
                preview = null;
                refresh();
              },
            },
            t('ai.discard'),
          ),
          el(
            'button.mn-btn',
            {
              type: 'button',
              onclick: () => {
                // Applied to the model as it is now, so nothing done meanwhile is lost.
                const r = applyOps(model, preview.operations, { meshes, names: solidNames() });
                const ids = r.added;
                preview = null;
                commit(r.model);
                selectOnly(
                  ids.filter((id) => (mode === '2d' ? id.startsWith('e') : id.startsWith('s'))),
                );
                window.mnui.toast(t('ai.applied'), {
                  action: { label: t('common.undo'), onClick: doUndo },
                });
              },
            },
            icon('check', { size: 18 }),
            t('ai.accept'),
          ),
        ),
      );
      box.append(card);
    }
    const online = mn.offline.online();
    const input = el('textarea.cad-ai-input', {
      rows: '3',
      maxlength: '2000',
      'aria-label': t('ai.inputLabel'),
      placeholder: t('ai.placeholder'),
    });
    const send = el(
      'button.mn-btn',
      { type: 'submit', disabled: !online, title: online ? '' : t('common.offlineHint') },
      icon('send', { size: 18 }),
      t('ai.send'),
    );
    const form = el('form.cad-ai-form', {}, input, send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) runAi(input.value.trim());
    });
    const chips = el('div.mn-chips', { role: 'group', 'aria-label': t('ai.suggestions') });
    for (const k of ['ai.s.dims', 'ai.s.check', 'ai.s.views', 'ai.s.bracket'])
      chips.append(
        el(
          'button.mn-filter',
          {
            type: 'button',
            'aria-pressed': 'false',
            disabled: !online,
            onclick: () => runAi(t(k)),
          },
          t(k),
        ),
      );
    box.append(form, chips);
    if (!online) box.append(el('p.mn-hint', {}, t('common.offlineHint')));
    return box;
  }

  function describeOp(o) {
    const n = (v) => (typeof v === 'number' ? fmt(toUnit(v), 3) : '–');
    switch (o.op) {
      case 'add_line':
        return t('op.add_line', { x1: n(o.x1), y1: n(o.y1), x2: n(o.x2), y2: n(o.y2) });
      case 'add_rect':
        return t('op.add_rect', { w: n(o.w), h: n(o.h), x: n(o.x), y: n(o.y) });
      case 'add_circle':
        return t('op.add_circle', { d: n((o.r ?? 0) * 2), x: n(o.cx), y: n(o.cy) });
      case 'add_box':
        return t('op.add_box', { w: n(o.w), d: n(o.d), h: n(o.h) });
      case 'add_cylinder':
        return t(o.mode === 'subtract' ? 'op.add_hole' : 'op.add_cylinder', {
          d: n((o.r ?? 0) * 2),
          h: n(o.h),
        });
      case 'set':
      case 'move':
      case 'rotate':
      case 'mirror':
      case 'delete':
      case 'duplicate':
      case 'extrude':
        return t(`op.${o.op}`, { target: String(o.target ?? '–') });
      default:
        return t(`op.${o.op}`);
    }
  }

  async function runAi(request) {
    if (aiBusy) return;
    chat.push({ role: 'user', text: request });
    aiBusy = new AbortController();
    panelTab = 'ai';
    renderPanel();
    try {
      const answer = await ask(mn, {
        model: store.settings.aiModel,
        project: model,
        selection,
        history: chat.slice(0, -1),
        request,
        lang: window.mnI18n.lang,
        signal: aiBusy.signal,
        settings: store.settings,
      });
      chat.push({ role: 'assistant', text: answer.reply || t('ai.noReply') });
      if (answer.operations.length) {
        const r = applyOps(model, answer.operations, { meshes, names: solidNames() });
        preview = { model: r.model, ids: r.added, operations: answer.operations, errors: r.errors };
        // Generated views live in the drawing: show where they land.
        if (answer.operations.some((o) => o.op === 'generate_views')) setMode('2d');
      }
    } catch (err) {
      chat.push({ role: 'assistant', text: t(aiErrorKey(err)) });
    } finally {
      aiBusy = null;
      refresh();
      panelTab = 'ai';
      renderPanel();
    }
  }

  // ---------------------------------------------------------------------------------------
  // Context menu and keyboard

  function canvasMenu(x, y) {
    if (!selection.length) return;
    contextMenu(
      x,
      y,
      [
        { label: t('editor.transform'), icon: 'move', onClick: transformSheet },
        { label: t('editor.duplicate'), icon: 'copy', onClick: duplicateSelection },
        { label: t('props.extrude'), icon: 'extrude', onClick: () => extrudeSheet() },
        { label: t('editor.delete'), icon: 'trash', danger: true, onClick: deleteSelection },
      ],
      canvas2d,
    );
  }

  function onKey(e) {
    if (e.key === ' ' && !typing(e) && document.activeElement === canvas2d) {
      space = e.type === 'keydown';
      e.preventDefault();
      return;
    }
    if (e.type !== 'keydown' || typing(e) || document.querySelector('.mn-overlay')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }
    if (mod && k === 'y') {
      e.preventDefault();
      doRedo();
      return;
    }
    if (mod && k === 'd') {
      e.preventDefault();
      duplicateSelection();
      return;
    }
    if (mod || e.altKey) return;
    if (k === 'escape') {
      if (mode === '3d') selectOnly([]);
      sketch.cancel();
      renderTools();
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      if (selection.length) {
        e.preventDefault();
        deleteSelection();
      }
      return;
    }
    if (k === '1') return setMode('2d');
    if (k === '2') return setMode('3d');
    if (k === '?') return app.shortcuts();
    if (k === 'enter' && sketch.tool === 'poly') return sketch.finishPoly(false);
    if (mode === '2d') {
      const map = {
        v: 'select',
        l: 'line',
        p: 'poly',
        r: 'rect',
        c: 'circle',
        a: 'arc',
        d: 'dim',
        t: 'text',
      };
      if (map[k]) {
        sketch.setTool(map[k]);
        renderTools();
        return;
      }
      if (k === 'f') sketch.fitAll();
      if (k === 'g' || k === 'o') {
        const key = k === 'g' ? 'snapGrid' : 'snapObjects';
        store.saveSettings({ [key]: !store.settings[key] }).then(() => {
          renderTools();
          window.mnui.toast(t(store.settings[key] ? 'editor.snapOn' : 'editor.snapOff'));
        });
      }
      if (k === 'e' && selection.length) transformSheet();
    } else {
      if (k === 'b') add3d('box');
      if (k === 'g') add3d('thread');
      if (k === 'z') add3d('cylinder');
      if (k === 'h') add3d('hole');
      if (k === 'e') add3d('extrude');
      if (k === 'f') view3d.fitAll();
    }
  }
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  // ---------------------------------------------------------------------------------------
  // First-use hints (at most three, each once, next to what they explain)

  async function hints() {
    const list = [
      ['tools', toolbar, 'hint.tools'],
      ['coords', inputBar, 'hint.coords'],
      ['ai', work, 'hint.ai'],
    ];
    for (const [id, anchor, key] of list) {
      if (await store.seen(id)) continue;
      const note = el(
        'div.cad-hint',
        { role: 'note' },
        el('p', {}, t(key)),
        el(
          'button.mn-btn',
          {
            type: 'button',
            onclick: async () => {
              note.remove();
              await store.markSeen(id);
              hints();
            },
          },
          t('hint.ok'),
        ),
      );
      anchor.before(note);
      return;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Start

  stage3d.hidden = mode !== '3d';
  stage2d.hidden = mode !== '2d';
  renderTools();
  renderPanel();
  refresh();
  requestAnimationFrame(() => {
    sketch.fitAll();
    sketch.host.status(sketch.prompt());
  });
  setRender(store.settings.render ?? 'fast', false);
  loadFiles();
  hints();

  return {
    async leave() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onKey);
      aiBusy?.abort();
      sketch.destroy();
      view3d.destroy();
      if (saveTimer) await save();
      await version();
    },
  };
}
