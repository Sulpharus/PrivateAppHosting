// Solids of the 3D model: primitives as polygon meshes, placement, and constructive solid geometry
// (union and subtraction with BSP trees). Units are millimetres, Z points up. Pure: tested in
// test/solid.test.js.
//
// A mesh is an array of convex polygons: { v: [[x,y,z], …] } with counter-clockwise vertices seen
// from outside. Triangle soups (imported STL/OBJ) are the same with three vertices each.

import { closedProfile } from './geom.js';

const PLANE_EPS = 1e-5;
export const RAW_LIMIT = 20_000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const unit = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

export const segmentsFor = (r, detail = 1) =>
  Math.max(16, Math.min(128, Math.round(Math.sqrt(Math.max(r, 0.5)) * 12 * detail)));

/** The polygon's plane: { n, w } with n·p = w. Uses Newell's method (robust for slivers). */
export function planeOf(v) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < v.length; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const n = unit([nx, ny, nz]);
  return { n, w: dot(n, v[0]) };
}

// ---------------------------------------------------------------------------------------------
// Primitives (local coordinates, before placement).

export function box(w, d, h) {
  const p = (x, y, z) => [x * w, y * d, z * h];
  const faces = [
    [p(0, 0, 0), p(0, 1, 0), p(1, 1, 0), p(1, 0, 0)], // bottom (−Z)
    [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)], // top
    [p(0, 0, 0), p(1, 0, 0), p(1, 0, 1), p(0, 0, 1)], // front (−Y)
    [p(1, 1, 0), p(0, 1, 0), p(0, 1, 1), p(1, 1, 1)], // back
    [p(0, 1, 0), p(0, 0, 0), p(0, 0, 1), p(0, 1, 1)], // left (−X)
    [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)], // right
  ];
  return faces.map((v) => ({ v }));
}

/** Frustum along Z from radius r1 at z=0 to r2 at z=h; a cylinder when r1 = r2. */
export function cone(r1, r2, h, n = segmentsFor(Math.max(r1, r2))) {
  const ring = (r, z) =>
    Array.from({ length: n }, (_, i) => [
      r * Math.cos((i / n) * 2 * Math.PI),
      r * Math.sin((i / n) * 2 * Math.PI),
      z,
    ]);
  const lo = ring(r1, 0);
  const hi = ring(r2, h);
  const out = [];
  if (r1 > 0) out.push({ v: [...lo].reverse() });
  if (r2 > 0) out.push({ v: hi });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (r1 > 0 && r2 > 0) out.push({ v: [lo[i], lo[j], hi[j], hi[i]] });
    else if (r1 > 0) out.push({ v: [lo[i], lo[j], [0, 0, h]] });
    else out.push({ v: [[0, 0, 0], hi[j], hi[i]] });
  }
  return out;
}

export const cylinder = (r, h, n) => cone(r, r, h, n);

export function sphere(r, n = segmentsFor(r)) {
  const slices = n;
  const stacks = Math.max(8, Math.round(n / 2));
  const at = (i, j) => {
    const theta = (i / slices) * 2 * Math.PI;
    const phi = (j / stacks) * Math.PI;
    return [
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      -r * Math.cos(phi),
    ];
  };
  const out = [];
  for (let i = 0; i < slices; i++)
    for (let j = 0; j < stacks; j++) {
      const v = [];
      v.push(at(i, j));
      if (j > 0) v.push(at(i + 1, j));
      if (j < stacks - 1) v.push(at(i + 1, j + 1));
      v.push(at(i, j + 1));
      out.push({ v });
    }
  return out;
}

/** Prism from a counter-clockwise 2D polygon, from z=0 to z=h. */
export function extrude(profile, h) {
  const out = [];
  const bottom = profile.map((p) => [p[0], p[1], 0]);
  const top = profile.map((p) => [p[0], p[1], h]);
  // Caps may be concave: triangulate them (ear clipping).
  for (const [a, b, c] of triangulate(profile)) {
    out.push({ v: [bottom[c], bottom[b], bottom[a]] });
    out.push({ v: [top[a], top[b], top[c]] });
  }
  for (let i = 0; i < profile.length; i++) {
    const j = (i + 1) % profile.length;
    out.push({ v: [bottom[i], bottom[j], top[j], top[i]] });
  }
  return out;
}

/** Ear clipping of a simple counter-clockwise polygon; returns index triples. */
export function triangulate(pts) {
  const idx = pts.map((_, i) => i);
  const tris = [];
  const isConvex = (a, b, c) =>
    (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) -
      (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]) >
    1e-12;
  const inside = (p, a, b, c) => {
    const s = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    return s(a, b, p) >= 0 && s(b, c, p) >= 0 && s(c, a, p) >= 0;
  };
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i - 1 + idx.length) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      if (!isConvex(a, b, c)) continue;
      let ear = true;
      for (const o of idx) {
        if (o === a || o === b || o === c) continue;
        if (inside(pts[o], pts[a], pts[b], pts[c])) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate polygon: fan the rest
  }
  for (let i = 1; i + 1 < idx.length; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
  return tris;
}

// ---------------------------------------------------------------------------------------------
// Placement: rotate (degrees, X then Y then Z) about the local origin, then move to pos.

export function transformMesh(mesh, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const [rx, ry, rz] = rot.map((d) => (d * Math.PI) / 180);
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const f = (p) => {
    let [x, y, z] = p;
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return [x + pos[0], y + pos[1], z + pos[2]];
  };
  return mesh.map((poly) => ({ v: poly.v.map(f) }));
}

/**
 * The mesh of one solid of the model (placed), or null when it has no geometry of its own yet
 * (an imported mesh whose file is not loaded: pass it as `loaded`).
 */
export function solidMesh(s, loaded = null) {
  let local;
  switch (s.kind) {
    case 'box':
      local = box(s.w, s.d, s.h);
      break;
    case 'cylinder':
      local = cylinder(s.r, s.h, segmentsFor(s.r, s.detail ?? 1));
      break;
    case 'cone':
      local = cone(s.r, s.r2 ?? 0, s.h, segmentsFor(Math.max(s.r, s.r2 ?? 0), s.detail ?? 1));
      break;
    case 'sphere':
      local = sphere(s.r, segmentsFor(s.r, s.detail ?? 1));
      break;
    case 'extrude': {
      const prof = closedProfile({ type: 'poly', pts: s.profile, closed: true });
      if (!prof) return null;
      local = extrude(prof, s.h);
      break;
    }
    case 'mesh':
      if (!loaded) return null;
      local = loaded;
      break;
    default:
      return null;
  }
  return transformMesh(local, s.pos, s.rot);
}

// ---------------------------------------------------------------------------------------------
// CSG with BSP trees (after the classic algorithm by Evan Wallace).

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

function makePoly(v, plane) {
  return { v, plane: plane ?? planeOf(v) };
}

function flipPoly(p) {
  return { v: [...p.v].reverse(), plane: { n: p.plane.n.map((x) => -x), w: -p.plane.w } };
}

function splitPolygon(plane, poly, coFront, coBack, front, back) {
  let type = 0;
  const types = [];
  for (const v of poly.v) {
    const t = dot(plane.n, v) - plane.w;
    const k = t < -PLANE_EPS ? BACK : t > PLANE_EPS ? FRONT : COPLANAR;
    type |= k;
    types.push(k);
  }
  switch (type) {
    case COPLANAR:
      (dot(plane.n, poly.plane.n) > 0 ? coFront : coBack).push(poly);
      break;
    case FRONT:
      front.push(poly);
      break;
    case BACK:
      back.push(poly);
      break;
    default: {
      const f = [];
      const b = [];
      for (let i = 0; i < poly.v.length; i++) {
        const j = (i + 1) % poly.v.length;
        const ti = types[i];
        const tj = types[j];
        const vi = poly.v[i];
        const vj = poly.v[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(vi);
        if ((ti | tj) === SPANNING) {
          const t = (plane.w - dot(plane.n, vi)) / dot(plane.n, sub(vj, vi));
          const v = lerp(vi, vj, t);
          f.push(v);
          b.push([...v]);
        }
      }
      if (f.length >= 3) front.push(makePoly(f, poly.plane));
      if (b.length >= 3) back.push(makePoly(b, poly.plane));
    }
  }
}

class Node {
  constructor(polys) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polys = [];
    if (polys) this.build(polys);
  }
  invert() {
    // Iterative to survive deep trees.
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      n.polys = n.polys.map(flipPoly);
      if (n.plane) n.plane = { n: n.plane.n.map((x) => -x), w: -n.plane.w };
      [n.front, n.back] = [n.back, n.front];
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
  }
  clipPolygons(polys) {
    if (!this.plane) return [...polys];
    let front = [];
    let back = [];
    for (const p of polys) splitPolygon(this.plane, p, front, back, front, back);
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }
  clipTo(bsp) {
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      n.polys = bsp.clipPolygons(n.polys);
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
  }
  allPolygons() {
    const out = [];
    const stack = [this];
    while (stack.length) {
      const n = stack.pop();
      for (const p of n.polys) out.push(p);
      if (n.front) stack.push(n.front);
      if (n.back) stack.push(n.back);
    }
    return out;
  }
  build(polys) {
    const work = [[this, polys]];
    while (work.length) {
      const [node, list] = work.pop();
      if (!list.length) continue;
      if (!node.plane) node.plane = list[0].plane;
      const front = [];
      const back = [];
      for (const p of list) splitPolygon(node.plane, p, node.polys, node.polys, front, back);
      if (front.length) {
        node.front ??= new Node();
        work.push([node.front, front]);
      }
      if (back.length) {
        node.back ??= new Node();
        work.push([node.back, back]);
      }
    }
  }
}

const toCsg = (mesh) =>
  mesh.filter((p) => p.v.length >= 3).map((p) => makePoly(p.v.map((v) => [...v])));
const fromCsg = (polys) => polys.map((p) => ({ v: p.v }));

export function union(a, b) {
  const A = new Node(toCsg(a));
  const B = new Node(toCsg(b));
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.allPolygons());
  return fromCsg(A.allPolygons());
}

export function subtract(a, b) {
  const A = new Node(toCsg(a));
  const B = new Node(toCsg(b));
  A.invert();
  A.clipTo(B);
  B.clipTo(A);
  B.invert();
  B.clipTo(A);
  B.invert();
  A.build(B.allPolygons());
  A.invert();
  return fromCsg(A.allPolygons());
}

export function intersect(a, b) {
  const A = new Node(toCsg(a));
  const B = new Node(toCsg(b));
  A.invert();
  B.clipTo(A);
  B.invert();
  A.clipTo(B);
  B.clipTo(A);
  A.build(B.allPolygons());
  A.invert();
  return fromCsg(A.allPolygons());
}

export function meshBounds(mesh) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const p of mesh)
    for (const v of p.v)
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
  if (min[0] === Number.POSITIVE_INFINITY) return null;
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

const boundsOverlap = (a, b) =>
  a && b && a.min.every((m, k) => m <= b.max[k] + 1e-6 && a.max[k] >= b.min[k] - 1e-6);

/**
 * The model as one mesh: every visible "add" solid joined, then every "subtract" solid removed.
 * Solids whose boxes do not touch are joined without CSG (fast, exact). `meshes` maps the id of an
 * imported mesh solid to its loaded polygons.
 */
export function combine(solids, meshes = new Map()) {
  const parts = [];
  const holes = [];
  const raw = [];
  for (const s of solids) {
    if (s.hidden) continue;
    const m = solidMesh(s, meshes.get(s.id) ?? null);
    if (!m) continue;
    // Very large imported meshes are shown and exported as they are: CSG on them would freeze.
    if (s.kind === 'mesh' && m.length > RAW_LIMIT) raw.push(m);
    else (s.op === 'subtract' ? holes : parts).push(m);
  }
  let result = [];
  let rb = null;
  for (const m of parts) {
    const mb = meshBounds(m);
    if (!result.length || !boundsOverlap(rb, mb)) result = result.concat(m);
    else result = union(result, m);
    rb = meshBounds(result);
  }
  for (const h of holes) {
    if (!result.length) break;
    if (!boundsOverlap(rb, meshBounds(h))) continue;
    result = subtract(result, h);
    rb = meshBounds(result);
  }
  return raw.length ? result.concat(...raw) : result;
}

/** Triangles of a polygon mesh (fan per convex polygon). */
export function triangles(mesh) {
  const out = [];
  for (const p of mesh)
    for (let i = 1; i + 1 < p.v.length; i++) out.push([p.v[0], p.v[i], p.v[i + 1]]);
  return out;
}

/** Enclosed volume in mm³ (divergence theorem; correct for closed meshes). */
export function volume(mesh) {
  let v = 0;
  for (const [a, b, c] of triangles(mesh)) v += dot(a, cross(b, c)) / 6;
  return Math.abs(v);
}

export function surfaceArea(mesh) {
  let s = 0;
  for (const [a, b, c] of triangles(mesh)) s += Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;
  return s;
}

/** Edges used by exactly one triangle (open mesh) or more than two: 0 for a clean solid. */
export function openEdges(mesh) {
  const key = (p) => p.map((x) => Math.round(x * 1e4)).join(',');
  const count = new Map();
  for (const [a, b, c] of triangles(mesh)) {
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const k1 = key(p);
      const k2 = key(q);
      const k = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const c of count.values()) if (c !== 2) bad++;
  return bad;
}

/** Share of the downward-facing surface steeper than `limit` degrees from vertical (overhangs). */
export function overhangArea(mesh, limitDeg = 45) {
  const lim = Math.cos(((90 - limitDeg) * Math.PI) / 180);
  const b = meshBounds(mesh);
  let s = 0;
  for (const [a, bb, c] of triangles(mesh)) {
    const n = cross(sub(bb, a), sub(c, a));
    const area = Math.hypot(...n) / 2;
    if (area < 1e-12) continue;
    const nz = n[2] / (2 * area);
    const onBed = b && Math.max(a[2], bb[2], c[2]) - b.min[2] < 1e-3;
    if (nz < -lim && !onBed) s += area;
  }
  return s;
}

export { cross, dot, sub, unit };
