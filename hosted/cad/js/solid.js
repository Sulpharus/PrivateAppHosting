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
  return mesh.map((poly) => ({ v: poly.v.map(f), s: poly.s }));
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
    case 'thread':
      // A bolt is made smaller by the clearance, a tap (hole) larger, so printed parts fit.
      local = thread(s.d, s.pitch, s.h, {
        offset: (s.op === 'subtract' ? 1 : -1) * (s.clearance ?? 0),
        left: Boolean(s.left),
      });
      break;
    default:
      return null;
  }
  const placed = transformMesh(local, s.pos, s.rot);
  for (const p of placed) p.s = s.id;
  return placed;
}

// ---------------------------------------------------------------------------------------------
// CSG with BSP trees (after the classic algorithm by Evan Wallace).

const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

function makePoly(v, plane, s) {
  return { v, plane: plane ?? planeOf(v), s };
}

function flipPoly(p) {
  return { v: [...p.v].reverse(), plane: { n: p.plane.n.map((x) => -x), w: -p.plane.w }, s: p.s };
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
      if (f.length >= 3) front.push(makePoly(f, poly.plane, poly.s));
      if (b.length >= 3) back.push(makePoly(b, poly.plane, poly.s));
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
  mesh
    .filter((p) => p.v.length >= 3)
    .map((p) =>
      makePoly(
        p.v.map((v) => [...v]),
        null,
        p.s,
      ),
    );
const fromCsg = (polys) => polys.map((p) => ({ v: p.v, s: p.s }));

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
  const partIds = [];
  for (const s of solids) {
    if (s.hidden) continue;
    const m = solidMesh(s, meshes.get(s.id) ?? null);
    if (!m) continue;
    // Very large imported meshes are shown and exported as they are: CSG on them would freeze.
    if (s.kind === 'mesh' && m.length > RAW_LIMIT) raw.push(m);
    else if (s.op === 'subtract') holes.push(m);
    else {
      parts.push(m);
      partIds.push(s.id);
    }
  }
  // Islands: groups of parts that touch. A union or a hole only works on the islands it
  // overlaps, so separate parts never go through CSG together (same result, much less work).
  let islands = [];
  parts.forEach((m, k) => {
    const b = meshBounds(m);
    const touching = islands.filter((isl) => boundsOverlap(isl.b, b));
    let mesh = m;
    const members = [{ id: partIds[k], b }];
    for (const isl of touching) {
      mesh = union(isl.mesh, mesh);
      members.push(...isl.members);
    }
    islands = islands.filter((isl) => !touching.includes(isl));
    islands.push({ mesh, b: meshBounds(mesh), members });
  });
  for (const h of holes) {
    const hb = meshBounds(h);
    for (const isl of islands) {
      if (!boundsOverlap(isl.b, hb)) continue;
      // The walls a hole leaves belong to (and look like) the part it cuts.
      const owner = (isl.members.find((x) => boundsOverlap(x.b, hb)) ?? isl.members[0]).id;
      const tool = h.map((p) => ({ v: p.v, s: owner }));
      isl.mesh = subtract(isl.mesh, tool);
      const nb = meshBounds(isl.mesh);
      if (nb) isl.b = nb;
    }
  }
  const result = islands.flatMap((isl) => isl.mesh);
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

// ---------------------------------------------------------------------------------------------
// Threads (ISO 68-1 metric basic profile), modelled as a true helix.

/** ISO metric coarse pitches by nominal diameter (mm). */
export const METRIC_COARSE = {
  2: 0.4,
  2.5: 0.45,
  3: 0.5,
  4: 0.7,
  5: 0.8,
  6: 1,
  8: 1.25,
  10: 1.5,
  12: 1.75,
  14: 2,
  16: 2,
  20: 2.5,
  24: 3,
  30: 3.5,
  36: 4,
};

/**
 * Segments per turn so the chord error stays below `tol` millimetres: the helix is as round as
 * the slicer or the CNC controller can tell (never coarser than 48).
 */
export const threadSegments = (r, tol = 0.002) =>
  Math.max(48, Math.min(256, Math.ceil(Math.PI * Math.sqrt(r / (2 * tol)))));

/**
 * A threaded rod along Z from 0 to `length`: nominal diameter `d`, `pitch`. The flanks are 60°, the
 * crest flat P/8 at the major diameter, the root flat P/4 at the minor diameter d − 1.0825·P (the
 * basic profile both bolt and nut are toleranced from). `offset` moves every radius (clearance).
 * The thread runs out over half a turn at both ends, like a cut or rolled thread, and the mesh is a
 * closed solid (every edge shared by two triangles).
 */
export function thread(d, pitch, length, { offset = 0, left = false, segments } = {}) {
  const P = pitch;
  const rMaj = d / 2 + offset;
  const rMin = d / 2 - 0.5412658773652741 * P + offset;
  if (length < 2 * P || rMin <= 0) return cylinder((rMaj + rMin) / 2, length);
  // Axial breakpoints of one pitch of the profile and the radius at each.
  const U = [0, P / 4, (9 * P) / 16, (11 * P) / 16, P];
  const R = [rMin, rMin, rMaj, rMaj, rMin];
  const S = segments ?? threadSegments(rMaj);
  const TWO_PI = 2 * Math.PI;
  const phiMax = (TWO_PI * (length - P)) / P;
  // Angles: S per turn plus the angle where the helix ends, repeated every turn, so adjacent
  // turns share their vertices exactly.
  const base = new Set(Array.from({ length: S }, (_, i) => (i * TWO_PI) / S));
  base.add(((phiMax % TWO_PI) + TWO_PI) % TWO_PI);
  const baseList = [...base].sort((a, b) => a - b);
  const phis = [];
  for (let k = 0; k * TWO_PI <= phiMax + 1e-12; k++)
    for (const b of baseList) {
      const phi = k * TWO_PI + b;
      if (phi <= phiMax + 1e-9) phis.push(Math.min(phi, phiMax));
    }
  if (phis.at(-1) < phiMax - 1e-9) phis.push(phiMax);
  const depth = (phi) => Math.min(1, phi / Math.PI, (phiMax - phi) / Math.PI);
  const sign = left ? -1 : 1;
  const at = (phi, r, z) => [r * Math.cos(sign * phi), r * Math.sin(sign * phi), z];
  const helix = (phi, j) => {
    const f = Math.max(0, depth(phi));
    return at(phi, rMin + f * (R[j] - rMin), U[j] + (P * phi) / TWO_PI);
  };
  const out = [];
  const tri = (a, b, c) => {
    const ab = sub(b, a);
    const ac = sub(c, a);
    const n = cross(ab, ac);
    if (n[0] * n[0] + n[1] * n[1] + n[2] * n[2] < 1e-18) return; // collapsed (skirt start)
    out.push(left ? { v: [a, c, b] } : { v: [a, b, c] });
  };
  const quad = (a, b, c, d2) => {
    tri(a, b, c);
    tri(a, c, d2);
  };
  // The thread surface: one helical band, four profile segments wide.
  for (let i = 0; i + 1 < phis.length; i++)
    for (let j = 0; j + 1 < U.length; j++)
      quad(
        helix(phis[i], j),
        helix(phis[i + 1], j),
        helix(phis[i + 1], j + 1),
        helix(phis[i], j + 1),
      );
  // Skirts: the plain core between the band and the flat ends, then the end discs.
  const bottom = phis.filter((p) => p <= TWO_PI + 1e-9);
  const top = phis.filter((p) => p >= phiMax - TWO_PI - 1e-9);
  const skirtLow = (phi, j) => at(phi, rMin, (U[j] * phi) / TWO_PI);
  const skirtHigh = (phi, j) => {
    const zTop = P + (P * phi) / TWO_PI;
    return at(phi, rMin, zTop + (U[j] / P) * (length - zTop));
  };
  for (const [list, f] of [
    [bottom, skirtLow],
    [top, skirtHigh],
  ])
    for (let i = 0; i + 1 < list.length; i++)
      for (let j = 0; j + 1 < U.length; j++)
        quad(f(list[i], j), f(list[i + 1], j), f(list[i + 1], j + 1), f(list[i], j + 1));
  for (let i = 0; i + 1 < bottom.length; i++)
    tri([0, 0, 0], skirtLow(bottom[i + 1], 0), skirtLow(bottom[i], 0));
  const last = U.length - 1;
  for (let i = 0; i + 1 < top.length; i++)
    tri([0, 0, length], skirtHigh(top[i], last), skirtHigh(top[i + 1], last));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Smooth shading: vertex normals averaged over faces that meet at less than `creaseDeg`, so round
// surfaces look round and real edges stay sharp. Returns, per triangle, three normals.

export function smoothNormals(tris, creaseDeg = 30) {
  const cosLimit = Math.cos((creaseDeg * Math.PI) / 180);
  const key = (p) =>
    `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;
  const faceN = tris.map(([a, b, c]) => {
    const n = cross(sub(b, a), sub(c, a));
    const area = Math.hypot(n[0], n[1], n[2]);
    return { n: area > 0 ? n.map((x) => x / area) : [0, 0, 1], area };
  });
  const at = new Map();
  tris.forEach((t, i) => {
    for (const p of t) {
      const k = key(p);
      let list = at.get(k);
      if (!list) {
        list = [];
        at.set(k, list);
      }
      list.push(i);
    }
  });
  return tris.map((t, i) => {
    const own = faceN[i].n;
    return t.map((p) => {
      const sum = [0, 0, 0];
      for (const j of at.get(key(p))) {
        const f = faceN[j];
        if (dot(f.n, own) < cosLimit) continue;
        sum[0] += f.n[0] * f.area;
        sum[1] += f.n[1] * f.area;
        sum[2] += f.n[2] * f.area;
      }
      const l = Math.hypot(sum[0], sum[1], sum[2]);
      return l > 0 ? [sum[0] / l, sum[1] / l, sum[2] / l] : own;
    });
  });
}
