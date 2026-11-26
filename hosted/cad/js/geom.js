// Pure 2D geometry of the drawing: entities, bounds, snapping, hit tests and transforms.
// Units are millimetres, X to the right, Y up. Angles in entities are radians, counter-clockwise.
// No DOM here: tested in test/geom.test.js.

export const EPS = 1e-9;

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const round = (v, digits = 4) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};
export const deg = (rad) => (rad * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;
export const normAngle = (a) => {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
};

/** Angle span of an arc from start to end, counter-clockwise, in (0, 2π]. */
export const arcSpan = (start, end) => {
  const s = normAngle(end - start);
  return s < EPS ? 2 * Math.PI : s;
};

export const polar = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

/** Circle through three points, or null when they are on one line. */
export function circleFrom3(p1, p2, p3) {
  const ax = p1[0];
  const ay = p1[1];
  const bx = p2[0];
  const by = p2[1];
  const cx = p3[0];
  const cy = p3[1];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { c: [ux, uy], r: Math.hypot(ax - ux, ay - uy) };
}

/** Arc from start point through a middle point to an end point. */
export function arcFrom3(p1, p2, p3) {
  const circle = circleFrom3(p1, p2, p3);
  if (!circle) return null;
  const a1 = Math.atan2(p1[1] - circle.c[1], p1[0] - circle.c[0]);
  const a2 = Math.atan2(p2[1] - circle.c[1], p2[0] - circle.c[0]);
  const a3 = Math.atan2(p3[1] - circle.c[1], p3[0] - circle.c[0]);
  // Counter-clockwise from a1 to a3 passes a2? Otherwise the arc runs the other way.
  const ccw = arcSpan(a1, a2) < arcSpan(a1, a3);
  return ccw
    ? { c: circle.c, r: circle.r, start: normAngle(a1), end: normAngle(a3) }
    : { c: circle.c, r: circle.r, start: normAngle(a3), end: normAngle(a1) };
}

export const angleInArc = (a, start, end) => arcSpan(start, a) <= arcSpan(start, end) + 1e-9;

/** The points a shape is drawn through (circles and arcs as polylines). */
export function outline(e, segments = 64) {
  switch (e.type) {
    case 'line':
      return [e.a, e.b];
    case 'rect':
      return [e.a, [e.b[0], e.a[1]], e.b, [e.a[0], e.b[1]], e.a];
    case 'poly':
      return e.closed ? [...e.pts, e.pts[0]] : e.pts;
    case 'circle': {
      const out = [];
      for (let i = 0; i <= segments; i++) out.push(polar(e.c, e.r, (i / segments) * 2 * Math.PI));
      return out;
    }
    case 'arc': {
      const span = arcSpan(e.start, e.end);
      const n = Math.max(4, Math.ceil((segments * span) / (2 * Math.PI)));
      const out = [];
      for (let i = 0; i <= n; i++) out.push(polar(e.c, e.r, e.start + (i / n) * span));
      return out;
    }
    default:
      return [];
  }
}

/** A closed region of the entity as a counter-clockwise polygon (no repeated last point), or null. */
export function closedProfile(e, segments = 64) {
  let pts = null;
  if (e.type === 'rect') pts = outline(e).slice(0, 4);
  else if (e.type === 'circle') pts = outline(e, segments).slice(0, segments);
  else if (e.type === 'poly' && e.closed && e.pts.length >= 3) pts = e.pts.map((p) => [...p]);
  if (!pts) return null;
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function bounds(entities) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = (p) => {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };
  for (const e of entities) {
    if (e.type === 'dim') {
      for (const p of dimGeometry(e).points) add(p);
    } else if (e.type === 'text') {
      add(e.p);
      add([e.p[0] + e.text.length * e.size * 0.6, e.p[1] + e.size]);
    } else for (const p of outline(e, 32)) add(p);
  }
  if (minX === Number.POSITIVE_INFINITY) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Distance from p to the segment a–b. */
export function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 < EPS ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function distToEntity(p, e) {
  if (e.type === 'circle') return Math.abs(dist(p, e.c) - e.r);
  if (e.type === 'arc') {
    const a = Math.atan2(p[1] - e.c[1], p[0] - e.c[0]);
    if (angleInArc(normAngle(a), e.start, e.end)) return Math.abs(dist(p, e.c) - e.r);
    return Math.min(dist(p, polar(e.c, e.r, e.start)), dist(p, polar(e.c, e.r, e.end)));
  }
  if (e.type === 'text') {
    const w = e.text.length * e.size * 0.6;
    const inside =
      p[0] >= e.p[0] && p[0] <= e.p[0] + w && p[1] >= e.p[1] && p[1] <= e.p[1] + e.size;
    return inside ? 0 : dist(p, e.p);
  }
  const pts = e.type === 'dim' ? dimGeometry(e).points : outline(e);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i + 1 < pts.length; i++)
    best = Math.min(best, distToSegment(p, pts[i], pts[i + 1]));
  return best;
}

/** The entity nearest to p within `tolerance`, or null. */
export function hitTest(entities, p, tolerance) {
  let best = null;
  let bestD = tolerance;
  for (const e of entities) {
    const d = distToEntity(p, e);
    if (d <= bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Every entity fully inside the box (window selection). */
export function inBox(entities, box) {
  return entities.filter((e) => {
    const b = bounds([e]);
    return (
      b && b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY
    );
  });
}

/** Points an object snap can catch: end, middle, centre and quadrant points. */
export function snapPoints(e) {
  switch (e.type) {
    case 'line':
      return [
        { p: e.a, kind: 'end' },
        { p: e.b, kind: 'end' },
        { p: mid(e.a, e.b), kind: 'mid' },
      ];
    case 'rect': {
      const pts = outline(e).slice(0, 4);
      const out = pts.map((p) => ({ p, kind: 'end' }));
      for (let i = 0; i < 4; i++) out.push({ p: mid(pts[i], pts[(i + 1) % 4]), kind: 'mid' });
      out.push({ p: mid(e.a, e.b), kind: 'center' });
      return out;
    }
    case 'poly': {
      const out = e.pts.map((p) => ({ p, kind: 'end' }));
      const n = e.closed ? e.pts.length : e.pts.length - 1;
      for (let i = 0; i < n; i++)
        out.push({ p: mid(e.pts[i], e.pts[(i + 1) % e.pts.length]), kind: 'mid' });
      return out;
    }
    case 'circle':
      return [
        { p: e.c, kind: 'center' },
        ...[0, 1, 2, 3].map((q) => ({ p: polar(e.c, e.r, (q * Math.PI) / 2), kind: 'quad' })),
      ];
    case 'arc':
      return [
        { p: e.c, kind: 'center' },
        { p: polar(e.c, e.r, e.start), kind: 'end' },
        { p: polar(e.c, e.r, e.end), kind: 'end' },
        { p: polar(e.c, e.r, e.start + arcSpan(e.start, e.end) / 2), kind: 'mid' },
      ];
    case 'dim':
      return [
        { p: e.a, kind: 'end' },
        { p: e.b, kind: 'end' },
      ];
    case 'text':
      return [{ p: e.p, kind: 'end' }];
    default:
      return [];
  }
}

/**
 * Where a cursor at p snaps to: the nearest object point within `tolerance`, otherwise the grid
 * (when grid > 0), otherwise p itself.
 */
export function snap(p, entities, { tolerance, grid = 0, objects = true, skip = null }) {
  if (objects) {
    let best = null;
    let bestD = tolerance;
    for (const e of entities) {
      if (skip?.has(e.id)) continue;
      for (const s of snapPoints(e)) {
        const d = dist(p, s.p);
        if (d <= bestD) {
          best = s;
          bestD = d;
        }
      }
    }
    if (best) return { p: [...best.p], kind: best.kind };
  }
  if (grid > 0)
    return { p: [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid], kind: 'grid' };
  return { p: [...p], kind: null };
}

/** Keeps the segment from `from` horizontal or vertical (Shift while drawing). */
export function ortho(from, p) {
  return Math.abs(p[0] - from[0]) >= Math.abs(p[1] - from[1]) ? [p[0], from[1]] : [from[0], p[1]];
}

/**
 * Reads a typed coordinate: "x,y" absolute, "@dx,dy" relative to `last`, "len<angle" polar
 * relative to `last` (degrees), or a bare length along `dir` (a unit vector) from `last`.
 * Comma or semicolon separate the values; a decimal comma works with a semicolon ("12,5;3").
 */
export function parseCoordinate(text, last, dir) {
  const t = text.trim().replace(/\s+/g, '');
  if (!t) return null;
  const num = (s) => {
    const v = Number(s.replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };
  const pair = (s) => {
    const parts = s.includes(';') ? s.split(';') : s.split(',');
    if (parts.length !== 2) return null;
    const x = num(parts[0]);
    const y = num(parts[1]);
    return x === null || y === null ? null : [x, y];
  };
  if (t.includes('<')) {
    const [l, a] = t.replace(/^@/, '').split('<');
    const len = num(l);
    const ang = num(a);
    if (len === null || ang === null || !last) return null;
    return polar(last, len, rad(ang));
  }
  if (t.startsWith('@')) {
    const d = pair(t.slice(1));
    if (!d || !last) return null;
    return [last[0] + d[0], last[1] + d[1]];
  }
  const p = pair(t);
  if (p) return p;
  const len = num(t);
  if (len !== null && last && dir) return [last[0] + dir[0] * len, last[1] + dir[1] * len];
  return null;
}

/** Geometry of a dimension: extension lines, the dimension line, arrows and the text spot. */
export function dimGeometry(e) {
  const kind = e.kind ?? 'aligned';
  let a = e.a;
  let b = e.b;
  let dir;
  if (kind === 'h') dir = [1, 0];
  else if (kind === 'v') dir = [0, 1];
  else {
    const l = dist(a, b) || 1;
    dir = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  }
  const n = [-dir[1], dir[0]];
  const off = e.offset ?? 10;
  // Base line through the further point along the normal, so h/v dimensions stay outside.
  const along = (p) => p[0] * dir[0] + p[1] * dir[1];
  const across = (p) => p[0] * n[0] + p[1] * n[1];
  const base =
    kind === 'aligned'
      ? across(a)
      : off >= 0
        ? Math.max(across(a), across(b))
        : Math.min(across(a), across(b));
  const line = base + off;
  const da = [dir[0] * along(a) + n[0] * line, dir[1] * along(a) + n[1] * line];
  const db = [dir[0] * along(b) + n[0] * line, dir[1] * along(b) + n[1] * line];
  a = e.a;
  b = e.b;
  const value = Math.abs(along(b) - along(a));
  const ext = Math.sign(off || 1) * 2;
  const extA = [a, [da[0] + n[0] * ext, da[1] + n[1] * ext]];
  const extB = [b, [db[0] + n[0] * ext, db[1] + n[1] * ext]];
  const textAt = [(da[0] + db[0]) / 2 + n[0] * 1.5, (da[1] + db[1]) / 2 + n[1] * 1.5];
  const angle = Math.atan2(dir[1], dir[0]);
  return { value, line: [da, db], extA, extB, textAt, angle, dir, n, points: [a, b, da, db] };
}

// ---------------------------------------------------------------------------------------------
// Transforms. Each returns a new entity (same id unless the caller changes it).

const mapPoints = (e, f) => {
  const out = structuredClone(e);
  if (out.a) out.a = f(out.a);
  if (out.b) out.b = f(out.b);
  if (out.c) out.c = f(out.c);
  if (out.p) out.p = f(out.p);
  if (out.pts) out.pts = out.pts.map(f);
  return out;
};

export function translate(e, dx, dy) {
  return mapPoints(e, (p) => [p[0] + dx, p[1] + dy]);
}

export function rotate(e, angle, center) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const f = (p) => {
    const x = p[0] - center[0];
    const y = p[1] - center[1];
    return [center[0] + x * cos - y * sin, center[1] + x * sin + y * cos];
  };
  if (e.type === 'rect' && Math.abs(normAngle(angle) % (Math.PI / 2)) > 1e-9) {
    // A rectangle turned by an odd angle becomes a closed polyline.
    const pts = outline(e).slice(0, 4).map(f);
    return { id: e.id, type: 'poly', pts, closed: true, style: e.style };
  }
  const out = mapPoints(e, f);
  if (out.type === 'arc') {
    out.start = normAngle(e.start + angle);
    out.end = normAngle(e.end + angle);
  }
  if (out.type === 'rect') {
    const a = f(e.a);
    const b = f(e.b);
    out.a = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
    out.b = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  if (out.type === 'text') out.angle = (e.angle ?? 0) + angle;
  return out;
}

/** Mirror across the vertical (axis 'y') or horizontal (axis 'x') line through `at`. */
export function mirror(e, axis, at) {
  const f = axis === 'y' ? (p) => [2 * at[0] - p[0], p[1]] : (p) => [p[0], 2 * at[1] - p[1]];
  const out = mapPoints(e, f);
  if (out.type === 'arc') {
    if (axis === 'y') {
      out.start = normAngle(Math.PI - e.end);
      out.end = normAngle(Math.PI - e.start);
    } else {
      out.start = normAngle(-e.end);
      out.end = normAngle(-e.start);
    }
  }
  if (out.type === 'rect') {
    const a = f(e.a);
    const b = f(e.b);
    out.a = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
    out.b = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  if (out.type === 'text')
    out.p = [out.p[0] - (axis === 'y' ? e.text.length * e.size * 0.6 : 0), out.p[1]];
  return out;
}

/** Length of an open shape or perimeter of a closed one. */
export function length(e) {
  if (e.type === 'circle') return 2 * Math.PI * e.r;
  if (e.type === 'arc') return e.r * arcSpan(e.start, e.end);
  const pts = outline(e);
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += dist(pts[i], pts[i + 1]);
  return s;
}

export function area(e) {
  if (e.type === 'circle') return Math.PI * e.r * e.r;
  const prof = closedProfile(e);
  return prof ? Math.abs(signedArea(prof)) : 0;
}

/** Offset a closed counter-clockwise polygon by d (positive = outward), mitred corners. */
export function offsetPolygon(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const e1 = norm([p1[0] - p0[0], p1[1] - p0[1]]);
    const e2 = norm([p2[0] - p1[0], p2[1] - p1[1]]);
    // Outward normals of a CCW polygon point to the right of each edge.
    const n1 = [e1[1], -e1[0]];
    const n2 = [e2[1], -e2[0]];
    const bis = norm([n1[0] + n2[0], n1[1] + n2[1]]);
    const cos = bis[0] * n1[0] + bis[1] * n1[1];
    const k = Math.abs(cos) < 0.2 ? d / 0.2 : d / cos;
    out.push([p1[0] + bis[0] * k, p1[1] + bis[1] * k]);
  }
  return out;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
