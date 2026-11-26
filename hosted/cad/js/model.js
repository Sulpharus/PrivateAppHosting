// The project model and the operations that change it. The editor, the import, the sample project
// and the AI assistant all change a model through `applyOps`, so every change is validated the same
// way and is one undo step. Pure: tested in test/model.test.js.
//
// model = { v: 1, seq, sketch: { entities: [...] }, solids: [...], sheet: {...} }
// Sketch entities (millimetres, angles in radians):
//   line { a, b } · rect { a (min corner), b (max corner) } · circle { c, r }
//   arc { c, r, start, end } (counter-clockwise) · poly { pts, closed } · text { p, text, size }
//   dim { a, b, kind: 'aligned'|'h'|'v', offset }   — every one with `style` and an id 'e<n>'
// Solids (millimetres, rotations in degrees), each with id 's<n>', name, op 'add'|'subtract', pos, rot:
//   box { w, d, h } (pos = min corner) · cylinder { r, h } and cone { r, r2, h } (pos = centre of
//   the base, axis Z) · sphere { r } (pos = centre) · extrude { profile, h } (pos = offset of the
//   profile's origin) · mesh { file, tris } (imported; pos/rot place it) · toolpath { file }

import {
  bounds,
  closedProfile,
  deg,
  mirror as mirror2,
  normAngle,
  rad,
  rotate as rotate2,
  round,
  translate,
} from './geom.js';
import { cleanMaterial } from './materials.js';
import { generateViews } from './projection.js';
import {
  combine,
  METRIC_COARSE,
  meshBounds,
  solidMesh,
  THREAD_MAX_TRIANGLES,
  threadTriangles,
} from './solid.js';

export const LIMIT = 100_000; // millimetres: anything beyond is a typo
export const STYLES = ['solid', 'center', 'hidden', 'construction'];
export const PAPERS = { A4: [297, 210], A3: [420, 297], A2: [594, 420] };
export const SCALES = ['10:1', '5:1', '2:1', '1:1', '1:2', '1:5', '1:10', '1:20', '1:50'];

export function emptyModel() {
  return {
    v: 1,
    seq: 0,
    sketch: { entities: [] },
    solids: [],
    groups: [],
    sheet: {
      title: '',
      paper: 'A4',
      orientation: 'landscape',
      scale: '1:1',
      material: '',
      number: '',
    },
  };
}

/** Fills in what an older or partial model lacks. */
export function normalise(model) {
  const m = { ...emptyModel(), ...(model ?? {}) };
  m.sketch = {
    entities: (Array.isArray(m.sketch?.entities) ? m.sketch.entities : []).filter(validEntity),
  };
  m.solids = (Array.isArray(m.solids) ? m.solids : []).filter(validSolid);
  // Parts of an assembly: a solid may belong to one; unknown references are dropped.
  m.groups = (Array.isArray(m.groups) ? m.groups : []).filter(
    (g) => g && /^g\d{1,9}$/.test(g.id) && typeof g.name === 'string' && g.name.trim(),
  );
  const groupIds = new Set(m.groups.map((g) => g.id));
  m.solids = m.solids.map((x) =>
    x.group === undefined || groupIds.has(x.group) ? x : { ...x, group: undefined },
  );
  m.sheet = { ...emptyModel().sheet, ...(m.sheet ?? {}) };
  let max = 0;
  for (const x of [...m.sketch.entities, ...m.solids, ...m.groups]) {
    const n = Number.parseInt(String(x.id).slice(1), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  m.seq = Math.max(m.seq ?? 0, max);
  return m;
}

const pt = (p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]);
const isId = (id) => typeof id === 'string' && /^[es]\d{1,9}$/.test(id);

/** True when a stored or imported entity has the shape the editor draws (bad ones are dropped). */
function validEntity(e) {
  if (!e || typeof e !== 'object' || !isId(e.id)) return false;
  if (e.style !== undefined && !STYLES.includes(e.style)) return false;
  switch (e.type) {
    case 'line':
    case 'rect':
      return pt(e.a) && pt(e.b);
    case 'dim':
      return pt(e.a) && pt(e.b) && (e.label === undefined || typeof e.label === 'string');
    case 'circle':
      return pt(e.c) && positive(e.r);
    case 'arc':
      return pt(e.c) && positive(e.r) && finite(e.start) && finite(e.end);
    case 'poly':
      return Array.isArray(e.pts) && e.pts.length >= 2 && e.pts.length <= 20000 && e.pts.every(pt);
    case 'text':
      return pt(e.p) && typeof e.text === 'string' && e.text.length <= 200 && positive(e.size);
    default:
      return false;
  }
}

function validSolid(x) {
  if (!x || typeof x !== 'object' || !isId(x.id) || typeof x.name !== 'string') return false;
  const v3 = (p) => Array.isArray(p) && p.length === 3 && p.every(finite);
  if (!v3(x.pos) || !v3(x.rot) || !['add', 'subtract'].includes(x.op)) return false;
  // An unknown material (a newer backup) is dropped, never the whole solid.
  if (x.material !== undefined) {
    const m = cleanMaterial(x.material);
    if (m) x.material = m;
    else delete x.material;
  }
  switch (x.kind) {
    case 'box':
      return positive(x.w) && positive(x.d) && positive(x.h);
    case 'cylinder':
    case 'sphere':
      return positive(x.r) && (x.kind === 'sphere' || positive(x.h));
    case 'cone':
      return positive(x.r) && finite(x.r2) && x.r2 >= 0 && positive(x.h);
    case 'extrude':
      return (
        positive(x.h) && Array.isArray(x.profile) && x.profile.length >= 3 && x.profile.every(pt)
      );
    case 'thread':
      try {
        validThread({ ...x, clearance: x.clearance ?? 0 });
        return true;
      } catch {
        return false;
      }
    case 'mesh':
    case 'toolpath':
      return typeof x.file === 'string' && /^projects\/[0-9a-f-]{36}\/s\d+\.(stl|nc)$/.test(x.file);
    default:
      return false;
  }
}

export const nextId = (model, prefix) => {
  model.seq += 1;
  return `${prefix}${model.seq}`;
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMIT;
const positive = (v) => finite(v) && v > 0;

class OpError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const need = (ok, code = 'invalid_value') => {
  if (!ok) throw new OpError(code);
};

// ---------------------------------------------------------------------------------------------
// Fields people and the assistant read and write, per kind (all numbers in mm or degrees).

export function fieldsOf(x) {
  switch (x.type ?? x.kind) {
    case 'line':
      return { x1: x.a[0], y1: x.a[1], x2: x.b[0], y2: x.b[1] };
    case 'rect':
      return { x: x.a[0], y: x.a[1], w: x.b[0] - x.a[0], h: x.b[1] - x.a[1] };
    case 'circle':
      return { cx: x.c[0], cy: x.c[1], r: x.r };
    case 'arc':
      return { cx: x.c[0], cy: x.c[1], r: x.r, start: deg(x.start), end: deg(x.end) };
    case 'text':
      return { x: x.p[0], y: x.p[1], size: x.size };
    case 'dim':
      return { x1: x.a[0], y1: x.a[1], x2: x.b[0], y2: x.b[1], offset: x.offset ?? 10 };
    case 'poly':
      return {};
    case 'box':
      return { ...pos3(x), w: x.w, d: x.d, h: x.h };
    case 'cylinder':
      return { ...pos3(x), r: x.r, h: x.h };
    case 'cone':
      return { ...pos3(x), r: x.r, r2: x.r2, h: x.h };
    case 'sphere':
      return { ...pos3(x), r: x.r };
    case 'extrude':
      return { ...pos3(x), h: x.h };
    case 'thread':
      return { ...pos3(x), d: x.d, pitch: x.pitch, h: x.h, clearance: x.clearance ?? 0 };
    default:
      return pos3(x);
  }
}

function pos3(s) {
  return { x: s.pos[0], y: s.pos[1], z: s.pos[2], rx: s.rot[0], ry: s.rot[1], rz: s.rot[2] };
}

/** Writes numeric fields back (only the ones given); validates them. */
export function setFields(x, f) {
  const o = structuredClone(x);
  const has = (k) => f[k] !== undefined && f[k] !== null;
  for (const [k, v] of Object.entries(f)) {
    if (
      ['text', 'style', 'name', 'mode', 'kind', 'closed', 'label', 'left', 'material'].includes(k)
    )
      continue;
    if (v !== undefined && v !== null) need(finite(v));
  }
  const pick = (k, cur) => (has(k) ? f[k] : cur);
  switch (o.type ?? o.kind) {
    case 'line':
    case 'dim':
      o.a = [pick('x1', o.a[0]), pick('y1', o.a[1])];
      o.b = [pick('x2', o.b[0]), pick('y2', o.b[1])];
      if (o.type === 'dim') {
        o.offset = pick('offset', o.offset ?? 10);
        if (['aligned', 'h', 'v'].includes(f.kind)) o.kind = f.kind;
        if (typeof f.label === 'string') o.label = f.label.slice(0, 40) || undefined;
      }
      break;
    case 'rect': {
      const x0 = pick('x', o.a[0]);
      const y0 = pick('y', o.a[1]);
      const w = pick('w', o.b[0] - o.a[0]);
      const h = pick('h', o.b[1] - o.a[1]);
      need(w > 0 && h > 0);
      o.a = [x0, y0];
      o.b = [x0 + w, y0 + h];
      break;
    }
    case 'circle':
      o.c = [pick('cx', o.c[0]), pick('cy', o.c[1])];
      o.r = pick('r', o.r);
      need(o.r > 0);
      break;
    case 'arc':
      o.c = [pick('cx', o.c[0]), pick('cy', o.c[1])];
      o.r = pick('r', o.r);
      need(o.r > 0);
      if (has('start')) o.start = normAngle(rad(f.start));
      if (has('end')) o.end = normAngle(rad(f.end));
      break;
    case 'text':
      o.p = [pick('x', o.p[0]), pick('y', o.p[1])];
      o.size = pick('size', o.size);
      need(o.size > 0);
      if (typeof f.text === 'string') {
        need(f.text.trim().length > 0 && f.text.length <= 200);
        o.text = f.text;
      }
      break;
    case 'poly':
      break;
    default:
      // Solids
      o.pos = [pick('x', o.pos[0]), pick('y', o.pos[1]), pick('z', o.pos[2])];
      o.rot = [pick('rx', o.rot[0]), pick('ry', o.rot[1]), pick('rz', o.rot[2])];
      for (const k of ['w', 'd', 'h', 'r']) if (k in o) o[k] = pick(k, o[k]);
      if ('r2' in o) o.r2 = pick('r2', o.r2);
      for (const k of ['w', 'd', 'h', 'r']) if (k in o) need(o[k] > 0);
      if ('r2' in o) need(o.r2 >= 0);
      if (o.kind === 'thread') {
        o.pitch = pick('pitch', o.pitch);
        o.clearance = pick('clearance', o.clearance ?? 0);
        if (typeof f.left === 'boolean') o.left = f.left;
        validThread(o);
      }
      if (f.material !== undefined) {
        const m = cleanMaterial(f.material);
        if (m) o.material = m;
        else delete o.material;
      }
      if (typeof f.name === 'string' && f.name.trim()) o.name = f.name.trim().slice(0, 80);
      if (f.mode === 'add' || f.mode === 'subtract') o.op = f.mode;
  }
  if (typeof f.style === 'string' && 'type' in o) {
    need(STYLES.includes(f.style));
    o.style = f.style;
  }
  return o;
}

// ---------------------------------------------------------------------------------------------
// Operations

export const OPS = [
  'add_line',
  'add_rect',
  'add_circle',
  'add_arc',
  'add_polyline',
  'add_dimension',
  'add_text',
  'add_box',
  'add_cylinder',
  'add_sphere',
  'add_cone',
  'add_thread',
  'extrude',
  'move',
  'rotate',
  'mirror',
  'set',
  'delete',
  'duplicate',
  'generate_views',
  'set_sheet',
  'make_group',
  'ungroup',
  'move_group',
  'rotate_group',
  'set_group',
  'delete_group',
];

const num = (o, k, def) => {
  const v = o[k] ?? def;
  need(finite(v), 'missing_value');
  return v;
};
const style = (o) => (STYLES.includes(o.style) ? o.style : 'solid');

function solidBase(model, o, kind, defName) {
  return {
    id: nextId(model, 's'),
    kind,
    name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : defName,
    op: o.mode === 'subtract' ? 'subtract' : 'add',
    pos: [num(o, 'x', 0), num(o, 'y', 0), num(o, 'z', 0)],
    rot: [num(o, 'rx', 0), num(o, 'ry', 0), num(o, 'rz', 0)],
    ...(cleanMaterial(o.material) ? { material: cleanMaterial(o.material) } : {}),
  };
}

function validThread(s) {
  need(s.d >= 1 && s.d <= 200, 'invalid_value');
  need(finite(s.pitch) && s.pitch >= 0.2 && s.pitch <= s.d / 4, 'invalid_value');
  need(finite(s.h) && s.h >= 2 * s.pitch, 'invalid_value');
  need(finite(s.clearance) && s.clearance >= 0 && s.clearance <= 1, 'invalid_value');
  // Keeps one thread under 400 000 triangles (a 3 m long M6 would freeze any computer).
  need(threadTriangles(s.d, s.pitch, s.h) <= THREAD_MAX_TRIANGLES, 'too_complex');
}

const findAny = (model, id) =>
  model.sketch.entities.find((e) => e.id === id) ?? model.solids.find((s) => s.id === id) ?? null;

function replace(model, x) {
  const i = model.sketch.entities.findIndex((e) => e.id === x.id);
  if (i >= 0) model.sketch.entities[i] = x;
  const j = model.solids.findIndex((s) => s.id === x.id);
  if (j >= 0) model.solids[j] = x;
}

/** Applies one operation to the model (in place). Returns the ids it created. */
export function applyOp(model, o, ctx = {}) {
  need(o && OPS.includes(o.op), 'unknown_op');
  const add = (e) => {
    model.sketch.entities.push(e);
    return [e.id];
  };
  const addSolid = (s) => {
    model.solids.push(s);
    return [s.id];
  };
  const names = ctx.names ?? {};
  switch (o.op) {
    case 'add_line':
      return add({
        id: nextId(model, 'e'),
        type: 'line',
        a: [num(o, 'x1'), num(o, 'y1')],
        b: [num(o, 'x2'), num(o, 'y2')],
        style: style(o),
      });
    case 'add_rect': {
      const w = num(o, 'w');
      const h = num(o, 'h');
      need(w > 0 && h > 0);
      const x = num(o, 'x');
      const y = num(o, 'y');
      return add({
        id: nextId(model, 'e'),
        type: 'rect',
        a: [x, y],
        b: [x + w, y + h],
        style: style(o),
      });
    }
    case 'add_circle':
      need(positive(o.r));
      return add({
        id: nextId(model, 'e'),
        type: 'circle',
        c: [num(o, 'cx'), num(o, 'cy')],
        r: o.r,
        style: style(o),
      });
    case 'add_arc':
      need(positive(o.r));
      return add({
        id: nextId(model, 'e'),
        type: 'arc',
        c: [num(o, 'cx'), num(o, 'cy')],
        r: o.r,
        start: normAngle(rad(num(o, 'start'))),
        end: normAngle(rad(num(o, 'end'))),
        style: style(o),
      });
    case 'add_polyline': {
      need(
        Array.isArray(o.points) && o.points.length >= 2 && o.points.length <= 2000,
        'missing_value',
      );
      const pts = o.points.map((p) => {
        need(p && finite(p.x) && finite(p.y));
        return [p.x, p.y];
      });
      return add({
        id: nextId(model, 'e'),
        type: 'poly',
        pts,
        closed: Boolean(o.closed) && pts.length >= 3,
        style: style(o),
      });
    }
    case 'add_dimension':
      return add({
        id: nextId(model, 'e'),
        type: 'dim',
        a: [num(o, 'x1'), num(o, 'y1')],
        b: [num(o, 'x2'), num(o, 'y2')],
        kind: ['h', 'v', 'aligned'].includes(o.kind) ? o.kind : 'aligned',
        offset: num(o, 'offset', 10),
        style: 'solid',
      });
    case 'add_text': {
      need(
        typeof o.text === 'string' && o.text.trim().length > 0 && o.text.length <= 200,
        'missing_value',
      );
      const size = num(o, 'size', 3.5);
      need(size > 0);
      return add({
        id: nextId(model, 'e'),
        type: 'text',
        p: [num(o, 'x'), num(o, 'y')],
        text: o.text,
        size,
        style: 'solid',
      });
    }
    case 'add_box': {
      const s = {
        ...solidBase(model, o, 'box', names.box ?? 'Quader'),
        w: num(o, 'w'),
        d: num(o, 'd'),
        h: num(o, 'h'),
      };
      need(s.w > 0 && s.d > 0 && s.h > 0);
      return addSolid(s);
    }
    case 'add_cylinder': {
      const s = {
        ...solidBase(model, o, 'cylinder', names.cylinder ?? 'Zylinder'),
        r: num(o, 'r'),
        h: num(o, 'h'),
      };
      need(s.r > 0 && s.h > 0);
      return addSolid(s);
    }
    case 'add_sphere': {
      const s = { ...solidBase(model, o, 'sphere', names.sphere ?? 'Kugel'), r: num(o, 'r') };
      need(s.r > 0);
      return addSolid(s);
    }
    case 'add_cone': {
      const s = {
        ...solidBase(model, o, 'cone', names.cone ?? 'Kegel'),
        r: num(o, 'r'),
        r2: num(o, 'r2', 0),
        h: num(o, 'h'),
      };
      need(s.r > 0 && s.r2 >= 0 && s.h > 0);
      return addSolid(s);
    }
    case 'add_thread': {
      const pitch = o.pitch ?? METRIC_COARSE[o.d];
      const s = {
        ...solidBase(model, o, 'thread', names.thread ?? 'Gewinde'),
        d: num(o, 'd'),
        pitch: num({ pitch }, 'pitch'),
        h: num(o, 'h'),
        clearance: num(o, 'clearance', 0),
        left: Boolean(o.left),
      };
      validThread(s);
      return addSolid(s);
    }
    case 'extrude': {
      const e = model.sketch.entities.find((x) => x.id === o.target);
      need(e, 'unknown_target');
      const prof = closedProfile(e, 96);
      need(prof, 'not_closed');
      const h = num(o, 'h');
      need(h > 0);
      const s = {
        ...solidBase(
          model,
          { ...o, x: o.x ?? 0, y: o.y ?? 0 },
          'extrude',
          names.extrude ?? 'Extrusion',
        ),
        profile: prof.map((p) => [round(p[0], 6), round(p[1], 6)]),
        h,
      };
      return addSolid(s);
    }
    case 'move': {
      const x = findAny(model, o.target);
      need(x, 'unknown_target');
      const dx = num(o, 'dx', 0);
      const dy = num(o, 'dy', 0);
      const dz = num(o, 'dz', 0);
      if (x.type) replace(model, translate(x, dx, dy));
      else replace(model, { ...x, pos: [x.pos[0] + dx, x.pos[1] + dy, x.pos[2] + dz] });
      return [];
    }
    case 'rotate': {
      const x = findAny(model, o.target);
      need(x, 'unknown_target');
      const a = num(o, 'angle');
      if (x.type) replace(model, rotate2(x, rad(a), [num(o, 'cx', 0), num(o, 'cy', 0)]));
      else replace(model, { ...x, rot: [x.rot[0], x.rot[1], x.rot[2] + a] });
      return [];
    }
    case 'mirror': {
      const x = model.sketch.entities.find((e) => e.id === o.target);
      need(x, 'unknown_target');
      replace(model, mirror2(x, o.axis === 'x' ? 'x' : 'y', [num(o, 'cx', 0), num(o, 'cy', 0)]));
      return [];
    }
    case 'set': {
      const x = findAny(model, o.target);
      need(x, 'unknown_target');
      const { op: _op, target: _t, ...rest } = o;
      replace(model, setFields(x, rest));
      return [];
    }
    case 'delete': {
      const before = model.sketch.entities.length + model.solids.length;
      model.sketch.entities = model.sketch.entities.filter((e) => e.id !== o.target);
      model.solids = model.solids.filter((s) => s.id !== o.target);
      need(model.sketch.entities.length + model.solids.length < before, 'unknown_target');
      return [];
    }
    case 'duplicate': {
      const x = findAny(model, o.target);
      need(x, 'unknown_target');
      const copy = structuredClone(x);
      copy.id = nextId(model, x.type ? 'e' : 's');
      delete copy.gen;
      const dx = num(o, 'dx', 0);
      const dy = num(o, 'dy', 0);
      const dz = num(o, 'dz', 0);
      if (x.type) return add(translate(copy, dx, dy));
      copy.pos = [x.pos[0] + dx, x.pos[1] + dy, x.pos[2] + dz];
      return addSolid(copy);
    }
    case 'generate_views': {
      const mesh = ctx.mesh ?? combine(model.solids, ctx.meshes ?? new Map());
      need(mesh.length > 0, 'no_solids');
      const views =
        Array.isArray(o.views) && o.views.length
          ? o.views.filter((v) => ['front', 'top', 'left', 'right', 'iso'].includes(v))
          : ['front', 'top', 'left', 'iso'];
      model.sketch.entities = model.sketch.entities.filter((e) => e.gen !== 'views');
      // Without a given place, the views go to the right of the person's own drawing.
      const own = bounds(model.sketch.entities);
      const origin =
        finite(o.x) && finite(o.y)
          ? [o.x, o.y]
          : own
            ? [round(own.maxX + 40, 0), round(own.minY, 0)]
            : [0, 0];
      const gen = generateViews(mesh, {
        views,
        method: o.method === 'third' ? 'third' : 'first',
        hidden: o.hidden !== false,
        dims: o.dims !== false,
        holes: model.solids,
        newId: () => nextId(model, 'e'),
        origin,
      });
      model.sketch.entities.push(...gen);
      return gen.map((e) => e.id);
    }
    case 'make_group': {
      const ids = Array.isArray(o.targets)
        ? o.targets.filter((id) => model.solids.some((x) => x.id === id))
        : [];
      need(ids.length > 0, 'unknown_target');
      const g = {
        id: nextId(model, 'g'),
        name:
          typeof o.name === 'string' && o.name.trim()
            ? o.name.trim().slice(0, 80)
            : (names.group ?? 'Teil'),
      };
      model.groups.push(g);
      model.solids = model.solids.map((x) => (ids.includes(x.id) ? { ...x, group: g.id } : x));
      return [g.id];
    }
    case 'ungroup': {
      need(
        model.groups.some((g) => g.id === o.target),
        'unknown_target',
      );
      model.groups = model.groups.filter((g) => g.id !== o.target);
      model.solids = model.solids.map((x) =>
        x.group === o.target ? { ...x, group: undefined } : x,
      );
      return [];
    }
    case 'delete_group': {
      need(
        model.groups.some((g) => g.id === o.target),
        'unknown_target',
      );
      model.groups = model.groups.filter((g) => g.id !== o.target);
      model.solids = model.solids.filter((x) => x.group !== o.target);
      return [];
    }
    case 'set_group': {
      const g = model.groups.find((x) => x.id === o.target);
      need(g, 'unknown_target');
      if (typeof o.name === 'string' && o.name.trim()) g.name = o.name.trim().slice(0, 80);
      const material = o.material !== undefined ? cleanMaterial(o.material) : undefined;
      model.solids = model.solids.map((x) => {
        if (x.group !== g.id) return x;
        const y = { ...x };
        if (typeof o.hidden === 'boolean') y.hidden = o.hidden;
        if (material && y.op !== 'subtract' && y.kind !== 'toolpath') y.material = material;
        return y;
      });
      return [];
    }
    case 'move_group': {
      need(
        model.groups.some((g) => g.id === o.target),
        'unknown_target',
      );
      const d = [num(o, 'dx', 0), num(o, 'dy', 0), num(o, 'dz', 0)];
      model.solids = model.solids.map((x) =>
        x.group === o.target ? { ...x, pos: x.pos.map((v, k) => v + d[k]) } : x,
      );
      return [];
    }
    case 'rotate_group': {
      need(
        model.groups.some((g) => g.id === o.target),
        'unknown_target',
      );
      const a = num(o, 'angle');
      const members = model.solids.filter((x) => x.group === o.target);
      // About the vertical axis through the centre of the part (or a given cx, cy).
      let c = [o.cx, o.cy];
      if (!finite(c[0]) || !finite(c[1])) {
        const b = meshBounds(
          members.flatMap((x) => solidMesh(x, ctx.meshes?.get(x.id) ?? null) ?? []),
        );
        need(b, 'unknown_target');
        c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2];
      }
      const r = rad(a);
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      model.solids = model.solids.map((x) => {
        if (x.group !== o.target) return x;
        const dx = x.pos[0] - c[0];
        const dy = x.pos[1] - c[1];
        return {
          ...x,
          pos: [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos, x.pos[2]],
          rot: [x.rot[0], x.rot[1], x.rot[2] + a],
        };
      });
      return [];
    }
    case 'set_sheet': {
      const s = { ...model.sheet };
      if (typeof o.title === 'string') s.title = o.title.slice(0, 120);
      const text = typeof o.sheetMaterial === 'string' ? o.sheetMaterial : o.material;
      if (typeof text === 'string') s.material = text.slice(0, 80);
      if (typeof o.number === 'string') s.number = o.number.slice(0, 40);
      if (Object.hasOwn(PAPERS, o.paper)) s.paper = o.paper;
      if (o.orientation === 'portrait' || o.orientation === 'landscape')
        s.orientation = o.orientation;
      if (SCALES.includes(o.scale)) s.scale = o.scale;
      model.sheet = s;
      return [];
    }
    default:
      throw new OpError('unknown_op');
  }
}

/**
 * Applies a list of operations to a copy of the model. Operations that fail are skipped and
 * reported; the rest still apply. Returns { model, added, errors: [{ index, code }] }.
 */
export function applyOps(model, ops, ctx = {}) {
  const m = structuredClone(model);
  const added = [];
  const errors = [];
  ops.forEach((o, index) => {
    try {
      added.push(...applyOp(m, o, ctx));
    } catch (err) {
      errors.push({ index, code: err instanceof OpError ? err.code : 'invalid_value' });
    }
  });
  return { model: m, added, errors };
}

/** A compact description of the model for the assistant (rounded, ids kept). */
export function describe(model) {
  const r = (v) => round(v, 3);
  const ent = model.sketch.entities
    .filter((e) => e.gen !== 'views')
    .slice(0, 400)
    .map((e) => {
      const f = Object.fromEntries(Object.entries(fieldsOf(e)).map(([k, v]) => [k, r(v)]));
      if (e.type === 'poly') f.points = e.pts.slice(0, 60).map((p) => [r(p[0]), r(p[1])]);
      if (e.type === 'poly') f.closed = Boolean(e.closed);
      if (e.type === 'text') f.text = e.text;
      if (e.type === 'dim') f.kind = e.kind;
      return {
        id: e.id,
        type: e.type,
        ...f,
        ...(e.style && e.style !== 'solid' ? { style: e.style } : {}),
      };
    });
  const generated = model.sketch.entities.filter((e) => e.gen === 'views').length;
  const solids = model.solids.map((s) => ({
    id: s.id,
    kind: s.kind,
    name: s.name,
    mode: s.op,
    ...Object.fromEntries(Object.entries(fieldsOf(s)).map(([k, v]) => [k, r(v)])),
    ...(s.kind === 'extrude'
      ? { profile: s.profile.slice(0, 40).map((p) => [r(p[0]), r(p[1])]) }
      : {}),
    ...(s.kind === 'mesh' ? { triangles: s.tris } : {}),
    ...(s.kind === 'thread' ? { left: Boolean(s.left) } : {}),
    ...(s.material ? { material: s.material } : {}),
    ...(s.group ? { part: s.group } : {}),
  }));
  return {
    units: 'mm',
    sheet: model.sheet,
    sketch: ent,
    generatedViewLines: generated,
    parts: model.groups.map((g) => ({ id: g.id, name: g.name })),
    solids,
  };
}
