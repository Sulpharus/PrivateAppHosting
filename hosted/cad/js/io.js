// File formats: STL (binary and ASCII) and OBJ for meshes, DXF (R12 ASCII) and SVG for drawings,
// G-code for CNC toolpaths. Pure functions over strings and ArrayBuffers: tested in test/io.test.js.

import { arcSpan, dimGeometry, normAngle, offsetPolygon, outline, polar, round } from './geom.js';
import { planeOf, triangles } from './solid.js';

// ---------------------------------------------------------------------------------------------
// STL

const MAX_TRIANGLES = 400_000;

/** Reads binary or ASCII STL into a polygon mesh (triangles). Throws 'too_large' or 'invalid'. */
export function readStl(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 84) {
    const view = new DataView(buffer);
    const n = view.getUint32(80, true);
    if (84 + n * 50 === bytes.length) {
      if (n > MAX_TRIANGLES) throw new Error('too_large');
      const out = [];
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12;
        const v = [0, 1, 2].map((k) => [
          view.getFloat32(o + k * 12, true),
          view.getFloat32(o + k * 12 + 4, true),
          view.getFloat32(o + k * 12 + 8, true),
        ]);
        out.push({ v });
      }
      return out;
    }
  }
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid/i.test(text) || !/vertex/i.test(text)) throw new Error('invalid');
  const out = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  let tri = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    tri.push([Number(m[1]), Number(m[2]), Number(m[3])]);
    if (tri.length === 3) {
      if (tri.flat().every(Number.isFinite)) out.push({ v: tri });
      tri = [];
      if (out.length > MAX_TRIANGLES) throw new Error('too_large');
    }
  }
  if (!out.length) throw new Error('invalid');
  return out;
}

/** Binary STL of a polygon mesh (millimetres, as slicers expect). */
export function writeStl(mesh, name = 'MiniNode CAD') {
  const tris = triangles(mesh);
  const buffer = new ArrayBuffer(84 + tris.length * 50);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(name.slice(0, 79));
  new Uint8Array(buffer).set(header, 0);
  view.setUint32(80, tris.length, true);
  let o = 84;
  for (const t of tris) {
    const { n } = planeOf(t);
    for (const x of [...n, ...t[0], ...t[1], ...t[2]]) {
      view.setFloat32(o, x, true);
      o += 4;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return buffer;
}

// ---------------------------------------------------------------------------------------------
// OBJ

export function readObj(text) {
  const verts = [];
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const [, x, y, z] = line.split(/\s+/).map(Number);
      verts.push([x, y, z]);
    } else if (line.startsWith('f ')) {
      const idx = line
        .split(/\s+/)
        .slice(1)
        .map((tok) => {
          const i = Number.parseInt(tok.split('/')[0], 10);
          return i < 0 ? verts.length + i : i - 1;
        });
      const v = idx.map((i) => verts[i]).filter(Boolean);
      // Faces may be concave: fan into triangles (OBJ faces are usually convex).
      for (let i = 1; i + 1 < v.length; i++) out.push({ v: [v[0], v[i], v[i + 1]] });
      if (out.length > MAX_TRIANGLES) throw new Error('too_large');
    }
  }
  if (!out.length || out.some((p) => p.v.flat().some((x) => !Number.isFinite(x))))
    throw new Error('invalid');
  return out;
}

export function writeObj(mesh) {
  const lines = ['# MiniNode CAD', 'o model'];
  const index = new Map();
  const faces = [];
  for (const p of mesh) {
    const ids = p.v.map((v) => {
      const k = v.map((x) => round(x, 5)).join(' ');
      if (!index.has(k)) {
        index.set(k, index.size + 1);
        lines.push(`v ${k}`);
      }
      return index.get(k);
    });
    faces.push(`f ${ids.join(' ')}`);
  }
  return `${lines.concat(faces).join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// DXF (R12 ASCII: LINE, CIRCLE, ARC, LWPOLYLINE/POLYLINE, TEXT; read and write)

/** Reads the drawing entities of a DXF file. Unknown entities are counted in `skipped`. */
export function readDxf(text, newId) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2)
    pairs.push([Number.parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  let inEntities = false;
  const raw = [];
  let current = null;
  for (let i = 0; i < pairs.length; i++) {
    const [code, value] = pairs[i];
    if (code === 2 && pairs[i - 1]?.[1] === 'SECTION') inEntities = value === 'ENTITIES';
    if (!inEntities) continue;
    if (code === 0) {
      if (current) raw.push(current);
      current = value === 'ENDSEC' ? null : { type: value, g: [] };
    } else if (current) current.g.push([code, value]);
  }
  if (current) raw.push(current);
  const out = [];
  let skipped = 0;
  const num = (g, c, d = 0) => {
    const f = g.find(([k]) => k === c);
    return f ? Number(f[1]) : d;
  };
  for (let i = 0; i < raw.length; i++) {
    const { type, g } = raw[i];
    switch (type) {
      case 'LINE':
        out.push({
          id: newId(),
          type: 'line',
          a: [num(g, 10), num(g, 20)],
          b: [num(g, 11), num(g, 21)],
        });
        break;
      case 'CIRCLE':
        out.push({ id: newId(), type: 'circle', c: [num(g, 10), num(g, 20)], r: num(g, 40) });
        break;
      case 'ARC':
        out.push({
          id: newId(),
          type: 'arc',
          c: [num(g, 10), num(g, 20)],
          r: num(g, 40),
          start: normAngle((num(g, 50) * Math.PI) / 180),
          end: normAngle((num(g, 51) * Math.PI) / 180),
        });
        break;
      case 'LWPOLYLINE': {
        const xs = g.filter(([k]) => k === 10).map(([, v]) => Number(v));
        const ys = g.filter(([k]) => k === 20).map(([, v]) => Number(v));
        const pts = xs.map((x, k) => [x, ys[k] ?? 0]);
        if (pts.length >= 2)
          out.push({ id: newId(), type: 'poly', pts, closed: (num(g, 70) & 1) === 1 });
        break;
      }
      case 'POLYLINE': {
        const closed = (num(g, 70) & 1) === 1;
        const pts = [];
        while (raw[i + 1]?.type === 'VERTEX') {
          i++;
          pts.push([num(raw[i].g, 10), num(raw[i].g, 20)]);
        }
        if (raw[i + 1]?.type === 'SEQEND') i++;
        if (pts.length >= 2) out.push({ id: newId(), type: 'poly', pts, closed });
        break;
      }
      case 'TEXT':
      case 'MTEXT': {
        const t = g.find(([k]) => k === 1)?.[1] ?? '';
        const clean = t
          .replace(/\\[A-Za-z][^;]*;|[{}]/g, '')
          .replace(/\\P/g, ' ')
          .slice(0, 200);
        if (clean)
          out.push({
            id: newId(),
            type: 'text',
            p: [num(g, 10), num(g, 20)],
            text: clean,
            size: num(g, 40, 3.5) || 3.5,
          });
        break;
      }
      default:
        skipped++;
    }
  }
  const valid = out.filter((e) => JSON.stringify(e).match(/null|NaN/) === null);
  return { entities: valid, skipped: skipped + out.length - valid.length };
}

/** A DXF R12 file of the drawing (dimensions and frames become lines and text). */
export function writeDxf(entities) {
  const o = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  const layer = (e) =>
    e.style === 'center'
      ? 'CENTER'
      : e.style === 'hidden'
        ? 'HIDDEN'
        : e.type === 'dim'
          ? 'DIM'
          : '0';
  const line = (a, b, l) =>
    o.push(
      '0',
      'LINE',
      '8',
      l,
      '10',
      f(a[0]),
      '20',
      f(a[1]),
      '30',
      '0',
      '11',
      f(b[0]),
      '21',
      f(b[1]),
      '31',
      '0',
    );
  const text = (p, s, h, l, angle = 0) =>
    o.push(
      '0',
      'TEXT',
      '8',
      l,
      '10',
      f(p[0]),
      '20',
      f(p[1]),
      '30',
      '0',
      '40',
      f(h),
      '1',
      s,
      '50',
      f((angle * 180) / Math.PI),
    );
  for (const e of entities) {
    if (e.style === 'construction') continue;
    const l = layer(e);
    switch (e.type) {
      case 'line':
        line(e.a, e.b, l);
        break;
      case 'circle':
        o.push('0', 'CIRCLE', '8', l, '10', f(e.c[0]), '20', f(e.c[1]), '30', '0', '40', f(e.r));
        break;
      case 'arc':
        o.push(
          '0',
          'ARC',
          '8',
          l,
          '10',
          f(e.c[0]),
          '20',
          f(e.c[1]),
          '30',
          '0',
          '40',
          f(e.r),
          '50',
          f((e.start * 180) / Math.PI),
          '51',
          f((e.end * 180) / Math.PI),
        );
        break;
      case 'rect':
      case 'poly': {
        const pts = e.type === 'rect' ? outline(e).slice(0, 4) : e.pts;
        const closed = e.type === 'rect' || e.closed;
        o.push(
          '0',
          'POLYLINE',
          '8',
          l,
          '66',
          '1',
          '10',
          '0',
          '20',
          '0',
          '30',
          '0',
          '70',
          closed ? '1' : '0',
        );
        for (const p of pts) o.push('0', 'VERTEX', '8', l, '10', f(p[0]), '20', f(p[1]), '30', '0');
        o.push('0', 'SEQEND', '8', l);
        break;
      }
      case 'text':
        text(e.p, e.text, e.size, l, e.angle ?? 0);
        break;
      case 'dim': {
        const g = dimGeometry(e);
        line(g.line[0], g.line[1], 'DIM');
        line(g.extA[0], g.extA[1], 'DIM');
        line(g.extB[0], g.extB[1], 'DIM');
        text(g.textAt, e.label ?? fmtNum(g.value), e.textSize ?? 3.5, 'DIM', g.angle);
        break;
      }
      default:
    }
  }
  o.push('0', 'ENDSEC', '0', 'EOF');
  return `${o.join('\n')}\n`;
}

const f = (v) => String(round(v, 6));
/** Default number text: a point as decimal sign (DXF; the app passes the person's format). */
export const fmtNum = (v) => String(round(v, 2));

// ---------------------------------------------------------------------------------------------
// SVG of the drawing (model units = millimetres; for export, the print view draws its own).

export function writeSvg(entities, { margin = 5, stroke = 0.35, num = fmtNum } = {}) {
  const pts = entities.flatMap((e) =>
    e.type === 'dim' ? dimGeometry(e).points : e.type === 'text' ? [e.p] : outline(e, 32),
  );
  if (!pts.length) return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;
  const w = maxX - minX;
  const h = maxY - minY;
  const body = entities.map((e) => svgOf(e, stroke, 1, num)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="${f(minX)} ${f(-maxY)} ${f(w)} ${f(h)}"><g transform="scale(1,-1)" fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round">${body}</g></svg>`;
}

const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** One entity as SVG in model coordinates (inside a group flipped with scale(1,-1)). */
export function svgOf(e, stroke = 0.35, k = 1, num = fmtNum) {
  const dash =
    e.style === 'center'
      ? ` stroke-dasharray="${f(stroke * 20)} ${f(stroke * 5)} ${f(stroke * 3)} ${f(stroke * 5)}"`
      : e.style === 'hidden'
        ? ` stroke-dasharray="${f(stroke * 8)} ${f(stroke * 5)}"`
        : '';
  const thin =
    e.style === 'center' || e.style === 'hidden' || e.type === 'dim'
      ? ` stroke-width="${f(stroke / 2)}"`
      : '';
  if (e.style === 'construction') return '';
  switch (e.type) {
    case 'line':
      return `<line x1="${f(e.a[0])}" y1="${f(e.a[1])}" x2="${f(e.b[0])}" y2="${f(e.b[1])}"${dash}${thin}/>`;
    case 'circle':
      return `<circle cx="${f(e.c[0])}" cy="${f(e.c[1])}" r="${f(e.r)}"${dash}${thin}/>`;
    case 'arc': {
      const s = polar(e.c, e.r, e.start);
      const t = polar(e.c, e.r, e.end);
      const large = arcSpan(e.start, e.end) > Math.PI ? 1 : 0;
      return `<path d="M${f(s[0])} ${f(s[1])}A${f(e.r)} ${f(e.r)} 0 ${large} 1 ${f(t[0])} ${f(t[1])}"${dash}${thin}/>`;
    }
    case 'rect':
    case 'poly': {
      const pts = e.type === 'rect' ? outline(e).slice(0, 4) : e.pts;
      const tag = e.type === 'rect' || e.closed ? 'polygon' : 'polyline';
      return `<${tag} points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}"${dash}${thin}/>`;
    }
    case 'text':
      return `<text transform="translate(${f(e.p[0])} ${f(e.p[1])}) rotate(${f((-(e.angle ?? 0) * 180) / Math.PI)}) scale(1,-1)" font-size="${f(e.size)}" font-family="sans-serif" fill="black" stroke="none">${esc(e.text)}</text>`;
    case 'dim': {
      const g = dimGeometry(e);
      const ah = 2.5 / k;
      const arrow = (p, d) => {
        const l = [p[0] - d[0] * ah + d[1] * ah * 0.3, p[1] - d[1] * ah - d[0] * ah * 0.3];
        const r = [p[0] - d[0] * ah - d[1] * ah * 0.3, p[1] - d[1] * ah + d[0] * ah * 0.3];
        return `<polygon points="${f(p[0])},${f(p[1])} ${f(l[0])},${f(l[1])} ${f(r[0])},${f(r[1])}" fill="black" stroke="none"/>`;
      };
      const label = esc(e.label ?? num(g.value));
      let ang = (g.angle * 180) / Math.PI;
      if (ang > 90 || ang <= -90) ang += 180;
      const size = e.textSize ?? 3.5 / k;
      return `<g stroke-width="${f(stroke / 2)}"><line x1="${f(g.line[0][0])}" y1="${f(g.line[0][1])}" x2="${f(g.line[1][0])}" y2="${f(g.line[1][1])}"/><line x1="${f(g.extA[0][0])}" y1="${f(g.extA[0][1])}" x2="${f(g.extA[1][0])}" y2="${f(g.extA[1][1])}"/><line x1="${f(g.extB[0][0])}" y1="${f(g.extB[0][1])}" x2="${f(g.extB[1][0])}" y2="${f(g.extB[1][1])}"/>${arrow(g.line[1], g.dir)}${arrow(g.line[0], [-g.dir[0], -g.dir[1]])}<text transform="translate(${f(g.textAt[0])} ${f(g.textAt[1])}) rotate(${f(-ang)}) scale(1,-1)" font-size="${f(size)}" font-family="sans-serif" text-anchor="middle" fill="black" stroke="none">${label}</text></g>`;
    }
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------------------------
// G-code: read toolpaths (G0/G1/G2/G3, G20/G21, G90/G91) and write contour programs.

/**
 * Reads a G-code program into moves: { rapid: [[x,y,z]…] segments, cut: [[x,y,z]…] polylines },
 * in millimetres. Arcs are flattened.
 */
export function readGcode(text) {
  let pos = [0, 0, 0];
  let absolute = true;
  let scale = 1;
  let mode = 0;
  const cut = [];
  const rapid = [];
  let current = null;
  let moves = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .replace(/\(.*?\)|;.*$/g, '')
      .toUpperCase()
      .trim();
    if (!line) continue;
    const words = {};
    const gs = [];
    for (const m of line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) {
      if (m[1] === 'G') gs.push(Number(m[2]));
      else words[m[1]] = Number(m[2]);
    }
    for (const g of gs) {
      if (g === 20) scale = 25.4;
      else if (g === 21) scale = 1;
      else if (g === 90) absolute = true;
      else if (g === 91) absolute = false;
      else if ([0, 1, 2, 3].includes(g)) mode = g;
    }
    if (!('X' in words || 'Y' in words || 'Z' in words)) continue;
    const target = [0, 1, 2].map((k) => {
      const w = 'XYZ'[k];
      if (!(w in words)) return pos[k];
      return absolute ? words[w] * scale : pos[k] + words[w] * scale;
    });
    moves++;
    if (mode === 0) {
      rapid.push([pos, target]);
      current = null;
    } else {
      if (!current) {
        current = [pos];
        cut.push(current);
      }
      if (mode === 1) current.push(target);
      else {
        // Arc in the XY plane with I/J centre offsets (or R radius).
        let c;
        if ('I' in words || 'J' in words)
          c = [pos[0] + (words.I ?? 0) * scale, pos[1] + (words.J ?? 0) * scale];
        else if ('R' in words) {
          const r = words.R * scale;
          const mx = (pos[0] + target[0]) / 2;
          const my = (pos[1] + target[1]) / 2;
          const dx = target[0] - pos[0];
          const dy = target[1] - pos[1];
          const d = Math.hypot(dx, dy) || 1;
          const h = Math.sqrt(Math.max(r * r - (d / 2) ** 2, 0));
          const side = (mode === 2) === r > 0 ? -1 : 1;
          c = [mx + (side * h * -dy) / d, my + (side * h * dx) / d];
        } else c = [pos[0], pos[1]];
        const r = Math.hypot(pos[0] - c[0], pos[1] - c[1]);
        let a0 = Math.atan2(pos[1] - c[1], pos[0] - c[0]);
        let a1 = Math.atan2(target[1] - c[1], target[0] - c[0]);
        if (mode === 3 && a1 <= a0) a1 += 2 * Math.PI;
        if (mode === 2 && a1 >= a0) a1 -= 2 * Math.PI;
        if (Math.abs(a1 - a0) < 1e-9) a1 = a0 + (mode === 3 ? 2 : -2) * Math.PI;
        const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 32)));
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const a = a0 + (a1 - a0) * t;
          current.push([
            c[0] + r * Math.cos(a),
            c[1] + r * Math.sin(a),
            pos[2] + (target[2] - pos[2]) * t,
          ]);
        }
        a0 = a1;
      }
    }
    pos = target;
    if (moves > 500_000) throw new Error('too_large');
  }
  if (!moves) throw new Error('invalid');
  return { cut, rapid };
}

/**
 * A CNC contour program for the drawing's shapes (millimetres, G21 G90, XY plane).
 * options: { tool, depth, step, feed, plunge, safeZ, rpm, side: 'on'|'outside'|'inside' }.
 * Circles no larger than the tool become drill holes (peck plunges).
 */
export function writeGcode(entities, o) {
  const out = [
    '(MiniNode CAD)',
    `(Werkzeug ${f(o.tool)} mm, Tiefe ${f(o.depth)} mm, Zustellung ${f(o.step)} mm)`,
    'G21 G90 G17',
    'G94',
  ];
  if (o.rpm > 0) out.push(`M3 S${Math.round(o.rpm)}`);
  out.push(`G0 Z${f(o.safeZ)}`);
  const passes = [];
  for (let z = -o.step; z > -o.depth + 1e-9; z -= o.step) passes.push(z);
  passes.push(-o.depth);
  const r = o.tool / 2;
  const off = o.side === 'outside' ? r : o.side === 'inside' ? -r : 0;
  for (const e of entities) {
    if (e.style === 'construction' || e.style === 'center' || e.type === 'dim' || e.type === 'text')
      continue;
    if (e.type === 'circle' && e.r <= r + 1e-9) {
      out.push(`(Bohrung ${f(e.r * 2)} mm)`, `G0 X${f(e.c[0])} Y${f(e.c[1])}`);
      for (const z of passes) out.push(`G1 Z${f(z)} F${f(o.plunge)}`, `G0 Z${f(0.5)}`);
      out.push(`G0 Z${f(o.safeZ)}`);
      continue;
    }
    if (e.type === 'circle') {
      const rr = Math.max(e.r + off, 0.001);
      const s = [e.c[0] + rr, e.c[1]];
      out.push(`(Kreis R${f(e.r)})`, `G0 X${f(s[0])} Y${f(s[1])}`);
      for (const z of passes)
        out.push(
          `G1 Z${f(z)} F${f(o.plunge)}`,
          `G3 X${f(s[0])} Y${f(s[1])} I${f(-rr)} J0 F${f(o.feed)}`,
        );
      out.push(`G0 Z${f(o.safeZ)}`);
      continue;
    }
    if (e.type === 'arc') {
      const rr = e.r + (o.side === 'on' ? 0 : off);
      const s = polar(e.c, rr, e.start);
      const t = polar(e.c, rr, e.end);
      out.push('(Bogen)', `G0 X${f(s[0])} Y${f(s[1])}`);
      for (const z of passes) {
        out.push(
          `G1 Z${f(z)} F${f(o.plunge)}`,
          `G3 X${f(t[0])} Y${f(t[1])} I${f(e.c[0] - s[0])} J${f(e.c[1] - s[1])} F${f(o.feed)}`,
        );
        out.push(`G0 Z${f(0.5)}`, `G0 X${f(s[0])} Y${f(s[1])}`);
      }
      out.push(`G0 Z${f(o.safeZ)}`);
      continue;
    }
    let pts =
      e.type === 'rect'
        ? outline(e).slice(0, 4)
        : e.type === 'poly'
          ? e.pts
          : e.type === 'line'
            ? [e.a, e.b]
            : null;
    if (!pts) continue;
    const closed = e.type === 'rect' || (e.type === 'poly' && e.closed);
    if (closed && off !== 0) {
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      const ccw = area > 0 ? pts : [...pts].reverse();
      pts = offsetPolygon(ccw, off);
    }
    const path = closed ? [...pts, pts[0]] : pts;
    out.push(`(Kontur)`, `G0 X${f(path[0][0])} Y${f(path[0][1])}`);
    let forward = true;
    for (const z of passes) {
      out.push(`G1 Z${f(z)} F${f(o.plunge)}`);
      const seq = closed || forward ? path.slice(1) : [...path].reverse().slice(1);
      for (const p of seq) out.push(`G1 X${f(p[0])} Y${f(p[1])} F${f(o.feed)}`);
      if (!closed) forward = !forward;
    }
    out.push(`G0 Z${f(o.safeZ)}`);
  }
  if (o.rpm > 0) out.push('M5');
  out.push('G0 X0 Y0', 'M2');
  return `${out.join('\n')}\n`;
}
