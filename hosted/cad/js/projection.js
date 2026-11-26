// Technical drawings from the 3D model: orthographic views (front, top, side, isometric) with
// visible edges as solid lines and hidden edges dashed (software depth buffer), placed in first- or
// third-angle projection, with overall dimensions and centre lines of holes. Pure: tested in
// test/projection.test.js.

import { cross, dot, meshBounds, planeOf, unit } from './solid.js';

export const VIEWS = {
  front: { v: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  top: { v: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  right: { v: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1] },
  left: { v: [-1, 0, 0], r: [0, -1, 0], u: [0, 0, 1] },
  iso: (() => {
    const v = unit([1, -1, 1]);
    const up = [0, 0, 1];
    const u = unit(up.map((x, k) => x - dot(up, v) * v[k]));
    return { v, r: cross(u, v), u };
  })(),
};

const FEATURE_COS = Math.cos((25 * Math.PI) / 180);

/** Edges of a polygon mesh with the normals of the faces that use them. */
export function meshEdges(mesh) {
  const q = (p) => p.map((x) => Math.round(x * 1e4)).join(',');
  const edges = new Map();
  const byPlane = new Map();
  for (const poly of mesh) {
    if (poly.v.length < 3) continue;
    const plane = planeOf(poly.v);
    const pk = `${plane.n.map((x) => Math.round(x * 1e3)).join(',')}|${Math.round(plane.w * 1e3)}`;
    for (let i = 0; i < poly.v.length; i++) {
      const a = poly.v[i];
      const b = poly.v[(i + 1) % poly.v.length];
      const ka = q(a);
      const kb = q(b);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      let e = edges.get(key);
      if (!e) {
        e = { a, b, key, normals: [], planes: [] };
        edges.set(key, e);
      }
      e.normals.push(plane.n);
      e.planes.push(pk);
      if (!byPlane.has(pk)) byPlane.set(pk, []);
      byPlane.get(pk).push([a, b, key]);
    }
  }
  return { edges: [...edges.values()], byPlane };
}

const onSegment = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = dot(ab, ab);
  if (len2 < 1e-12) return false;
  const t = dot([p[0] - a[0], p[1] - a[1], p[2] - a[2]], ab) / len2;
  if (t < -1e-6 || t > 1 + 1e-6) return false;
  const d = [a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]];
  return dot(d, d) < 1e-8;
};

/** Edges that show in a view: creases, silhouettes and real boundaries. */
function visibleEdgeSet({ edges, byPlane }, view) {
  const out = [];
  for (const e of edges) {
    const uniquePlanes = new Set(e.planes);
    if (e.normals.length === 2) {
      const [n1, n2] = e.normals;
      const crease = dot(n1, n2) < FEATURE_COS;
      const f1 = dot(n1, view.v);
      const f2 = dot(n2, view.v);
      const silhouette = (f1 > 1e-6 && f2 < -1e-6) || (f1 < -1e-6 && f2 > 1e-6);
      if (crease || silhouette) out.push(e);
      continue;
    }
    if (uniquePlanes.size === 1 && e.normals.length === 1) {
      // A T-junction inside one flat face (CSG splits faces): skip when a neighbour on the same
      // plane runs along it.
      const m = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
      const same = byPlane.get(e.planes[0]) ?? [];
      if (same.some(([a, b, key]) => key !== e.key && onSegment(m, a, b))) continue;
    }
    out.push(e);
  }
  return out;
}

const project = (p, view) => [dot(p, view.r), dot(p, view.u), -dot(p, view.v)];

/** Depth buffer of the mesh in a view, `res` pixels across the larger side. */
function depthBuffer(mesh, view, res) {
  const pts = mesh.flatMap((p) => p.v.map((v) => project(v, view)));
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const s = res / Math.max(maxX - minX, maxY - minY, 1e-6);
  const W = Math.ceil((maxX - minX) * s) + 3;
  const H = Math.ceil((maxY - minY) * s) + 3;
  const z = new Float32Array(W * H).fill(Number.POSITIVE_INFINITY);
  const toPx = (p) => [(p[0] - minX) * s + 1, (p[1] - minY) * s + 1, p[2]];
  for (const poly of mesh) {
    const v = poly.v.map((q) => toPx(project(q, view)));
    for (let i = 1; i + 1 < v.length; i++) raster(z, W, H, v[0], v[i], v[i + 1]);
  }
  return { z, W, H, s, toPx };
}

function raster(z, W, H, a, b, c) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) < 1e-12) return;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
      const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const d = w0 * a[2] + w1 * b[2] + w2 * c[2];
      const i = y * W + x;
      if (d < z[i]) z[i] = d;
    }
}

/**
 * The 2D line work of one view, in view coordinates (millimetres): [{ a, b, hidden }].
 * `res` is the depth buffer size; larger is more exact and slower.
 */
export function viewLines(mesh, viewName, { res = 900, hidden = true } = {}) {
  const view = VIEWS[viewName];
  if (!mesh.length) return [];
  const edgeData = meshEdges(mesh);
  const shown = visibleEdgeSet(edgeData, view);
  const { z, W, H, s, toPx } = depthBuffer(mesh, view, res);
  const b = meshBounds(mesh);
  const diag = Math.hypot(...b.size);
  const eps = 2.5 / s + diag * 1e-4;
  const out = [];
  for (const e of shown) {
    const pa = project(e.a, view);
    const pb = project(e.b, view);
    const lenPx = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) * s;
    if (lenPx < 0.05) continue; // seen end-on: a point
    const n = Math.max(2, Math.ceil(lenPx / 1.5));
    const states = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = [
        pa[0] + (pb[0] - pa[0]) * t,
        pa[1] + (pb[1] - pa[1]) * t,
        pa[2] + (pb[2] - pa[2]) * t,
      ];
      const [x, y] = toPx(p);
      // The nearest surface in a small neighbourhood (edges lie on pixel borders).
      let near = Number.POSITIVE_INFINITY;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      for (let dy = -1; dy <= 0; dy++)
        for (let dx = -1; dx <= 0; dx++) {
          const xx = xi + dx;
          const yy = yi + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
            const zz = z[yy * W + xx];
            if (zz < near) near = zz;
          }
        }
      states.push(p[2] <= near + eps);
    }
    // Ignore single-sample flickers.
    for (let i = 1; i + 1 < states.length; i++)
      if (states[i - 1] === states[i + 1] && states[i] !== states[i - 1]) states[i] = states[i - 1];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || states[i] !== states[start]) {
        const t0 = start / n;
        const t1 = i / n;
        const a = [pa[0] + (pb[0] - pa[0]) * t0, pa[1] + (pb[1] - pa[1]) * t0];
        const bb = [pa[0] + (pb[0] - pa[0]) * t1, pa[1] + (pb[1] - pa[1]) * t1];
        const isHidden = !states[start];
        if (!isHidden || hidden) out.push({ a, b: bb, hidden: isHidden });
        start = i;
      }
    }
  }
  return out;
}

const box2 = (lines) => {
  if (!lines.length) return null;
  const xs = lines.flatMap((l) => [l.a[0], l.b[0]]);
  const ys = lines.flatMap((l) => [l.a[1], l.b[1]]);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};

/**
 * Drawing entities for the chosen views of the mesh, placed with `gap` millimetres between them,
 * the front view's lower left corner at `origin`.
 * options: { views: ['front','top','left','iso'], method: 'first'|'third', hidden, dims,
 *            holes: solids with op 'subtract' (for centre lines), newId, origin, gap }
 */
export function generateViews(mesh, options) {
  const {
    views = ['front', 'top', 'left'],
    method = 'first',
    hidden = true,
    dims = true,
    holes = [],
    newId,
    origin = [0, 0],
    gap = 20,
  } = options;
  const tag = 'views';
  const out = [];
  const lines = {};
  const boxes = {};
  for (const v of views) {
    lines[v] = viewLines(mesh, v, { hidden: v === 'iso' ? false : hidden });
    boxes[v] = box2(lines[v]);
  }
  const fb = boxes.front;
  if (!fb && views.includes('front')) return out;
  const fw = fb ? fb.maxX - fb.minX : 0;
  const fh = fb ? fb.maxY - fb.minY : 0;
  // Offsets: where each view's own min corner goes.
  const place = {};
  if (fb) place.front = [origin[0], origin[1]];
  const below = method === 'first';
  if (boxes.top) {
    const th = boxes.top.maxY - boxes.top.minY;
    place.top = [origin[0], below ? origin[1] - gap - th : origin[1] + fh + gap];
  }
  for (const side of ['left', 'right']) {
    if (!boxes[side]) continue;
    const sw = boxes[side].maxX - boxes[side].minX;
    // First angle: the view from the left sits on the right; third angle: on the same side.
    const onRight = (side === 'left') === (method === 'first');
    place[side] = [onRight ? origin[0] + fw + gap : origin[0] - gap - sw, origin[1]];
  }
  if (boxes.iso) {
    const sideW = boxes.left
      ? boxes.left.maxX - boxes.left.minX
      : boxes.right
        ? boxes.right.maxX - boxes.right.minX
        : 0;
    const x = origin[0] + fw + gap + (sideW ? sideW + gap : 0);
    const y = below ? origin[1] - gap - (boxes.iso.maxY - boxes.iso.minY) : origin[1] + fh + gap;
    place.iso = [x, y];
  }
  const mapper = (v) => {
    const b = boxes[v];
    const [ox, oy] = place[v];
    return (p) => [p[0] - b.minX + ox, p[1] - b.minY + oy];
  };
  for (const v of views) {
    if (!boxes[v] || !place[v]) continue;
    const m = mapper(v);
    for (const chain of chainLines(lines[v])) {
      const pts = chain.pts.map(m);
      const style = chain.hidden ? 'hidden' : 'solid';
      if (pts.length === 2)
        out.push({ id: newId(), type: 'line', a: pts[0], b: pts[1], style, gen: tag, view: v });
      else
        out.push({
          id: newId(),
          type: 'poly',
          pts,
          closed: chain.closed,
          style,
          gen: tag,
          view: v,
        });
    }
  }
  // Centre lines of round holes whose axis runs along the view direction or across it.
  for (const h of holes) {
    if (h.kind !== 'cylinder' || h.op !== 'subtract' || h.hidden) continue;
    const rot = h.rot ?? [0, 0, 0];
    if (rot[0] % 360 !== 0 || rot[1] % 360 !== 0) continue; // only holes along Z
    const ext = h.r + 2;
    for (const v of views) {
      if (!boxes[v] || !place[v] || v === 'iso') continue;
      const m = mapper(v);
      const view = VIEWS[v];
      const c = project(h.pos, view);
      if (v === 'top') {
        out.push({
          id: newId(),
          type: 'line',
          a: m([c[0] - ext, c[1]]),
          b: m([c[0] + ext, c[1]]),
          style: 'center',
          gen: tag,
          view: v,
        });
        out.push({
          id: newId(),
          type: 'line',
          a: m([c[0], c[1] - ext]),
          b: m([c[0], c[1] + ext]),
          style: 'center',
          gen: tag,
          view: v,
        });
      } else {
        const z0 = Math.max(h.pos[2], meshBounds(mesh).min[2]) - 2;
        const z1 = Math.min(h.pos[2] + h.h, meshBounds(mesh).max[2]) + 2;
        out.push({
          id: newId(),
          type: 'line',
          a: m([c[0], z0]),
          b: m([c[0], z1]),
          style: 'center',
          gen: tag,
          view: v,
        });
      }
    }
  }
  if (dims) {
    const dim = (a, b, kind, offset, view) =>
      out.push({ id: newId(), type: 'dim', a, b, kind, offset, gen: tag, view });
    if (boxes.front && place.front) {
      const m = mapper('front');
      const b = boxes.front;
      // Width above the front view (first angle: the top view sits below), else below it.
      const yEdge = below ? b.maxY : b.minY;
      dim(m([b.minX, yEdge]), m([b.maxX, yEdge]), 'h', below ? 10 : -10, 'front');
      dim(m([b.minX, b.minY]), m([b.minX, b.maxY]), 'v', 10, 'front');
    }
    if (boxes.top && place.top) {
      const m = mapper('top');
      const b = boxes.top;
      dim(m([b.minX, b.minY]), m([b.minX, b.maxY]), 'v', 10, 'top');
    }
  }
  return out;
}

/**
 * Joins line pieces that meet end to end (same kind, only two pieces at the joint) into polylines
 * and drops points on straight runs: [{ pts, hidden, closed }].
 */
export function chainLines(lines) {
  const key = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
  const at = new Map();
  lines.forEach((l, i) => {
    for (const p of [l.a, l.b]) {
      const k = `${key(p)}|${l.hidden ? 1 : 0}`;
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  });
  const used = new Uint8Array(lines.length);
  const next = (p, hidden, from) => {
    const list = at.get(`${key(p)}|${hidden ? 1 : 0}`) ?? [];
    if (list.length !== 2) return -1;
    const j = list[0] === from ? list[1] : list[0];
    return used[j] ? -1 : j;
  };
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const h = lines[i].hidden;
    const pts = [lines[i].a, lines[i].b];
    // Grow forward from the end, then backward from the start.
    for (const forward of [true, false]) {
      let cur = i;
      for (;;) {
        const end = forward ? pts.at(-1) : pts[0];
        const j = next(end, h, cur);
        if (j < 0) break;
        used[j] = 1;
        const l = lines[j];
        const other = key(l.a) === key(end) ? l.b : l.a;
        if (forward) pts.push(other);
        else pts.unshift(other);
        cur = j;
      }
    }
    let closed = false;
    if (pts.length > 3 && key(pts[0]) === key(pts.at(-1))) {
      pts.pop();
      closed = true;
    }
    out.push({ pts: simplify(pts, closed), hidden: h, closed });
  }
  return out;
}

function simplify(pts, closed) {
  if (pts.length < 3) return pts;
  const keep = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = keep.at(-1);
    const b = pts[i];
    const c = pts[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    if (Math.abs(cross) / len > 1e-4) keep.push(b);
  }
  keep.push(pts.at(-1));
  return closed && keep.length < 3 ? pts : keep;
}
