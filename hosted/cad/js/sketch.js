// The 2D drawing canvas: view (pan, zoom), grid, snapping, drawing tools, selection and the line
// work. Every change goes back to the editor as operations (model.js), so it can be undone.

import {
  arcFrom3,
  arcSpan,
  bounds,
  circleFrom3,
  deg,
  dimGeometry,
  dist,
  hitTest,
  inBox,
  ortho,
  outline,
  parseCoordinate,
  snap,
} from './geom.js';
import { fmt, t } from './ui.js';

const boundsCache = new WeakMap();

export const TOOLS = ['select', 'line', 'poly', 'rect', 'circle', 'arc', 'dim', 'text'];

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

export class Sketch {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.host = host;
    this.tool = 'select';
    this.selected = new Set();
    this.points = []; // clicks of the current tool
    this.cursor = null; // snapped world point under the pointer
    this.snapKind = null;
    this.scale = 4; // px per mm
    this.ox = -20;
    this.oy = -20;
    this.pointers = new Map();
    this.drag = null;
    this.shift = false;
    this.preview = null; // { model, ids } from the assistant
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.bind();
    this.resize();
  }

  destroy() {
    this.resizeObserver.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get entities() {
    return (this.preview?.model ?? this.host.model()).sketch.entities;
  }

  // ---------------------------------------------------------------------------------------
  // View

  /** Takes the size of the canvas's container (it changes while the canvas is hidden). */
  syncSize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(50, r.width);
    this.h = Math.max(50, r.height);
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize() {
    this.syncSize();
    if (this.wantFit && this.canvas.offsetParent) {
      this.wantFit = false;
      this.fitAll();
      return;
    }
    this.draw();
  }

  toScreen(p) {
    return [(p[0] - this.ox) * this.scale, this.h - (p[1] - this.oy) * this.scale];
  }

  toWorld(x, y) {
    return [x / this.scale + this.ox, (this.h - y) / this.scale + this.oy];
  }

  zoomAt(x, y, factor) {
    const before = this.toWorld(x, y);
    this.scale = Math.min(500, Math.max(0.02, this.scale * factor));
    const after = this.toWorld(x, y);
    this.ox += before[0] - after[0];
    this.oy += before[1] - after[1];
    this.draw();
  }

  fitAll() {
    // Hidden (the other mode is shown): fit once it is visible and has its size.
    if (!this.canvas.offsetParent) {
      this.wantFit = true;
      return;
    }
    this.syncSize();
    const b = bounds(this.entities);
    if (!b) {
      this.scale = 4;
      this.ox = -this.w / this.scale / 2 + 50;
      this.oy = -this.h / this.scale / 2 + 30;
    } else {
      const pad = 40;
      this.scale = Math.min(
        (this.w - pad * 2) / Math.max(b.w, 1),
        (this.h - pad * 2) / Math.max(b.h, 1),
      );
      this.scale = Math.min(200, Math.max(0.02, this.scale));
      this.ox = b.minX - (this.w / this.scale - b.w) / 2;
      this.oy = b.minY - (this.h / this.scale - b.h) / 2;
    }
    this.draw();
  }

  // ---------------------------------------------------------------------------------------
  // Tools

  setTool(tool) {
    this.tool = tool;
    this.points = [];
    if (tool !== 'select') this.setSelection([]);
    this.canvas.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    this.host.status(this.prompt());
    this.draw();
  }

  /** The hint for the next click of the current tool. */
  prompt() {
    const n = this.points.length;
    const k = {
      select: 'sketch.prompt.select',
      line: n ? 'sketch.prompt.lineNext' : 'sketch.prompt.lineStart',
      poly: n ? 'sketch.prompt.polyNext' : 'sketch.prompt.polyStart',
      rect: n ? 'sketch.prompt.rectNext' : 'sketch.prompt.rectStart',
      circle: n ? 'sketch.prompt.circleNext' : 'sketch.prompt.circleStart',
      arc:
        ['sketch.prompt.arcStart', 'sketch.prompt.arcMid', 'sketch.prompt.arcEnd'][n] ??
        'sketch.prompt.arcEnd',
      dim:
        ['sketch.prompt.dimStart', 'sketch.prompt.dimEnd', 'sketch.prompt.dimOffset'][n] ??
        'sketch.prompt.dimOffset',
      text: 'sketch.prompt.text',
    }[this.tool];
    return t(k);
  }

  setSelection(ids) {
    this.selected = new Set(ids);
    this.host.selection([...this.selected]);
    this.draw();
  }

  cancel() {
    if (this.points.length) {
      // A chain of lines or a polyline in progress: Escape finishes what is there.
      if (this.tool === 'poly' && this.points.length >= 2) this.finishPoly(false);
      this.points = [];
    } else if (this.tool !== 'select') this.setTool('select');
    else this.setSelection([]);
    this.host.status(this.prompt());
    this.draw();
  }

  /** A point from a click or from typed input. */
  addPoint(p) {
    const pts = this.points;
    const style = this.host.lineStyle();
    switch (this.tool) {
      case 'line':
        if (pts.length) {
          if (dist(pts[0], p) > 1e-9)
            this.host.apply([
              { op: 'add_line', x1: pts[0][0], y1: pts[0][1], x2: p[0], y2: p[1], style },
            ]);
          this.points = [p];
        } else this.points = [p];
        break;
      case 'poly':
        if (pts.length >= 3 && dist(pts[0], p) < 6 / this.scale) {
          this.finishPoly(true);
          return;
        }
        pts.push(p);
        break;
      case 'rect':
        if (pts.length) {
          const w = Math.abs(p[0] - pts[0][0]);
          const h = Math.abs(p[1] - pts[0][1]);
          if (w > 1e-9 && h > 1e-9)
            this.host.apply([
              {
                op: 'add_rect',
                x: Math.min(p[0], pts[0][0]),
                y: Math.min(p[1], pts[0][1]),
                w,
                h,
                style,
              },
            ]);
          this.points = [];
        } else pts.push(p);
        break;
      case 'circle':
        if (pts.length) {
          const r = dist(pts[0], p);
          if (r > 1e-9)
            this.host.apply([{ op: 'add_circle', cx: pts[0][0], cy: pts[0][1], r, style }]);
          this.points = [];
        } else pts.push(p);
        break;
      case 'arc':
        pts.push(p);
        if (pts.length === 3) {
          const a = arcFrom3(pts[0], pts[1], pts[2]);
          if (a)
            this.host.apply([
              {
                op: 'add_arc',
                cx: a.c[0],
                cy: a.c[1],
                r: a.r,
                start: deg(a.start),
                end: deg(a.end),
                style,
              },
            ]);
          this.points = [];
        }
        break;
      case 'dim':
        pts.push(p);
        if (pts.length === 3) {
          const [a, b, o] = pts;
          const kind = this.dimKind(a, b, o);
          const g = dimGeometry({ a, b, kind, offset: 0 });
          const across = (q) => q[0] * g.n[0] + q[1] * g.n[1];
          const base =
            kind === 'aligned'
              ? across(a)
              : across(o) >= Math.max(across(a), across(b))
                ? Math.max(across(a), across(b))
                : Math.min(across(a), across(b));
          this.host.apply([
            {
              op: 'add_dimension',
              x1: a[0],
              y1: a[1],
              x2: b[0],
              y2: b[1],
              kind,
              offset: across(o) - base,
            },
          ]);
          this.points = [];
        }
        break;
      case 'text':
        this.host.askText(p);
        break;
      default:
    }
    this.host.status(this.prompt());
    this.draw();
  }

  dimKind(a, b, o) {
    // Horizontal when the offset point is above or below the pair, vertical when beside it.
    const minX = Math.min(a[0], b[0]);
    const maxX = Math.max(a[0], b[0]);
    const minY = Math.min(a[1], b[1]);
    const maxY = Math.max(a[1], b[1]);
    if (Math.abs(a[0] - b[0]) < 1e-9) return 'v';
    if (Math.abs(a[1] - b[1]) < 1e-9) return 'h';
    if (o[0] >= minX && o[0] <= maxX && (o[1] > maxY || o[1] < minY)) return 'h';
    if (o[1] >= minY && o[1] <= maxY && (o[0] > maxX || o[0] < minX)) return 'v';
    return 'aligned';
  }

  finishPoly(closed) {
    const pts = this.points;
    if (pts.length >= 2)
      this.host.apply([
        {
          op: 'add_polyline',
          points: pts.map((p) => ({ x: p[0], y: p[1] })),
          closed: closed && pts.length >= 3,
          style: this.host.lineStyle(),
        },
      ]);
    this.points = [];
    this.host.status(this.prompt());
    this.draw();
  }

  /** Typed input from the coordinate field; returns false when it could not be read. */
  typed(text) {
    const last = this.points.at(-1) ?? null;
    let dir = null;
    if (last && this.cursor && dist(last, this.cursor) > 1e-9) {
      const l = dist(last, this.cursor);
      dir = [(this.cursor[0] - last[0]) / l, (this.cursor[1] - last[1]) / l];
    } else if (last) dir = [1, 0];
    // Typed values are in the person's unit (mm or inches); the drawing is in mm.
    const k = this.host.unitScale();
    const v = text.trim().replace(',', '.');
    if (this.tool === 'circle' && last && /^\d*\.?\d+$/.test(v)) {
      this.addPoint([last[0] + Number(v) * k, last[1]]);
      return true;
    }
    const lastU = last ? [last[0] / k, last[1] / k] : null;
    const p = parseCoordinate(text, lastU, dir);
    if (!p) return false;
    if (this.tool === 'select') return false;
    this.addPoint([p[0] * k, p[1] * k]);
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Pointer input

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener('dblclick', () => {
      if (this.tool === 'poly') this.finishPoly(false);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const w = this.toWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = hitTest(this.entities, w, 8 / this.scale);
      if (hit && !this.selected.has(hit.id)) this.setSelection([hit.id]);
      this.host.contextMenu(e.clientX, e.clientY);
    });
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  snapped(xy) {
    const raw = this.toWorld(...xy);
    const s = this.host.settings();
    const skip = this.drag?.kind === 'move' ? this.selected : null;
    let r = snap(raw, this.entities, {
      tolerance: 10 / this.scale,
      grid: s.snapGrid ? s.grid : 0,
      objects: s.snapObjects,
      skip,
    });
    const from = this.points.at(-1);
    if (this.shift && from && r.kind !== 'end' && r.kind !== 'center')
      r = { p: ortho(from, r.p), kind: 'ortho' };
    return r;
  }

  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    this.shift = e.shiftKey;
    if (this.pointers.size === 2) {
      // Two fingers: pinch and pan.
      const [a, b] = [...this.pointers.values()];
      this.drag = { kind: 'pinch', d: dist(a, b), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      return;
    }
    const xy = this.local(e);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.host.spaceHeld())) {
      this.drag = { kind: 'pan', last: xy };
      return;
    }
    if (e.button !== 0) return;
    if (this.tool !== 'select') {
      this.drag = { kind: 'click', start: xy, pointerType: e.pointerType };
      return;
    }
    const w = this.toWorld(...xy);
    const hit = hitTest(this.entities, w, 8 / this.scale);
    if (hit) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const s = new Set(this.selected);
        s.has(hit.id) ? s.delete(hit.id) : s.add(hit.id);
        this.setSelection([...s]);
        this.drag = null;
        return;
      }
      if (!this.selected.has(hit.id)) this.setSelection([hit.id]);
      this.drag = { kind: 'move', start: xy, from: this.snapped(xy).p, moved: false };
    } else {
      this.drag = { kind: 'box', start: xy, now: xy, add: e.shiftKey };
    }
  }

  move(e) {
    const xy = this.local(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, xy);
    this.shift = e.shiftKey;
    const d = this.drag;
    if (d?.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const nd = dist(a, b);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      this.ox -= (m[0] - d.m[0]) / this.scale;
      this.oy += (m[1] - d.m[1]) / this.scale;
      this.zoomAt(m[0], m[1], nd / (d.d || nd));
      d.d = nd;
      d.m = m;
      return;
    }
    if (d?.kind === 'pan') {
      this.ox -= (xy[0] - d.last[0]) / this.scale;
      this.oy += (xy[1] - d.last[1]) / this.scale;
      d.last = xy;
      this.draw();
      return;
    }
    const s = this.snapped(xy);
    this.cursor = s.p;
    this.snapKind = s.kind;
    if (d?.kind === 'box') d.now = xy;
    if (d?.kind === 'move' && dist(d.start, xy) > 4) d.moved = true;
    this.host.coords(s.p, this.points.at(-1) ?? null);
    this.draw();
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const xy = this.local(e);
    if (d.kind === 'click') {
      if (dist(d.start, xy) < 10) this.addPoint(this.snapped(xy).p);
    } else if (d.kind === 'box') {
      if (dist(d.start, xy) < 4) {
        if (!d.add) this.setSelection([]);
      } else {
        const a = this.toWorld(...d.start);
        const b = this.toWorld(...xy);
        const box = {
          minX: Math.min(a[0], b[0]),
          maxX: Math.max(a[0], b[0]),
          minY: Math.min(a[1], b[1]),
          maxY: Math.max(a[1], b[1]),
        };
        const ids = inBox(this.entities, box).map((x) => x.id);
        this.setSelection(d.add ? [...this.selected, ...ids] : ids);
      }
    } else if (d.kind === 'move' && d.moved) {
      const to = this.snapped(xy).p;
      const dx = to[0] - d.from[0];
      const dy = to[1] - d.from[1];
      if (Math.hypot(dx, dy) > 1e-9)
        this.host.apply([...this.selected].map((id) => ({ op: 'move', target: id, dx, dy })));
    }
    this.draw();
  }

  // ---------------------------------------------------------------------------------------
  // Drawing

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  paint() {
    const { ctx, w, h } = this;
    const col = {
      bg: css('--mn-surface'),
      ink: css('--mn-ink'),
      muted: css('--mn-muted'),
      line: css('--mn-line'),
      strong: css('--mn-line-strong'),
      accent: css('--mn-accent'),
      accentText: css('--mn-accent-text'),
      warn: css('--mn-warn'),
      ok: css('--mn-ok'),
    };
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, w, h);
    const s = this.host.settings();
    if (s.gridVisible) this.paintGrid(col, s.grid);
    // Axes through the origin.
    const o = this.toScreen([0, 0]);
    ctx.strokeStyle = col.strong;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(o[0], 0);
    ctx.lineTo(o[0], h);
    ctx.moveTo(0, o[1]);
    ctx.lineTo(w, o[1]);
    ctx.stroke();
    const previewIds = new Set(this.preview?.ids ?? []);
    // Only what is on screen is drawn (bounds are cached per entity object; edits replace it).
    const lo = this.toWorld(0, h);
    const hi = this.toWorld(w, 0);
    const pad = 20 / this.scale;
    for (const e of this.entities) {
      let eb = boundsCache.get(e);
      if (!eb) {
        eb = bounds([e]);
        boundsCache.set(e, eb);
      }
      if (
        eb &&
        (eb.maxX < lo[0] - pad ||
          eb.minX > hi[0] + pad ||
          eb.maxY < lo[1] - pad ||
          eb.minY > hi[1] + pad)
      )
        continue;
      const sel = this.selected.has(e.id);
      const pv = previewIds.has(e.id);
      this.paintEntity(
        e,
        sel ? col.accent : pv ? col.ok : e.style === 'construction' ? col.muted : col.ink,
        sel || pv ? 2.2 : 1.4,
        col,
      );
    }
    this.paintRubber(col);
    const d = this.drag;
    if (d?.kind === 'box') {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(d.start[0], d.start[1], d.now[0] - d.start[0], d.now[1] - d.start[1]);
      ctx.setLineDash([]);
    }
    if (d?.kind === 'move' && d.moved && this.cursor) {
      const dx = this.cursor[0] - d.from[0];
      const dy = this.cursor[1] - d.from[1];
      ctx.globalAlpha = 0.6;
      for (const e of this.entities.filter((x) => this.selected.has(x.id))) {
        const moved = JSON.parse(JSON.stringify(e));
        for (const k of ['a', 'b', 'c', 'p'])
          if (moved[k]) moved[k] = [moved[k][0] + dx, moved[k][1] + dy];
        if (moved.pts) moved.pts = moved.pts.map((p) => [p[0] + dx, p[1] + dy]);
        this.paintEntity(moved, col.accent, 1.4, col);
      }
      ctx.globalAlpha = 1;
    }
    // Snap marker
    if (this.cursor && this.tool !== 'select' && this.snapKind && this.snapKind !== 'grid') {
      const p = this.toScreen(this.cursor);
      ctx.strokeStyle = col.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (this.snapKind === 'center') ctx.arc(p[0], p[1], 6, 0, Math.PI * 2);
      else if (this.snapKind === 'mid') {
        ctx.moveTo(p[0], p[1] - 7);
        ctx.lineTo(p[0] + 7, p[1] + 5);
        ctx.lineTo(p[0] - 7, p[1] + 5);
        ctx.closePath();
      } else ctx.rect(p[0] - 5, p[1] - 5, 10, 10);
      ctx.stroke();
    }
  }

  paintGrid(col, grid) {
    const { ctx, w, h } = this;
    let step = grid;
    while (step * this.scale < 8) step *= step === grid ? 2 : 5;
    const major = step * 5;
    const a = this.toWorld(0, h);
    const b = this.toWorld(w, 0);
    ctx.lineWidth = 1;
    for (const [st, colr] of [
      [step, col.line],
      [major, col.strong],
    ]) {
      ctx.strokeStyle = colr;
      ctx.globalAlpha = st === major ? 0.35 : 0.6;
      ctx.beginPath();
      for (let x = Math.floor(a[0] / st) * st; x <= b[0]; x += st) {
        const sx = Math.round(this.toScreen([x, 0])[0]) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
      }
      for (let y = Math.floor(a[1] / st) * st; y <= b[1]; y += st) {
        const sy = Math.round(this.toScreen([0, y])[1]) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  dash(style) {
    if (style === 'center') return [12, 4, 2, 4];
    if (style === 'hidden') return [6, 4];
    if (style === 'construction') return [2, 4];
    return [];
  }

  paintEntity(e, colour, width) {
    const { ctx } = this;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth =
      e.style === 'center' || e.style === 'hidden' || e.type === 'dim'
        ? Math.max(1, width - 0.4)
        : width;
    ctx.setLineDash(this.dash(e.style));
    if (e.type === 'circle') {
      const c = this.toScreen(e.c);
      ctx.beginPath();
      ctx.arc(c[0], c[1], e.r * this.scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'arc') {
      const c = this.toScreen(e.c);
      ctx.beginPath();
      // Screen Y is flipped: draw counter-clockwise from -start to -end.
      ctx.arc(c[0], c[1], e.r * this.scale, -e.start, -e.start - arcSpan(e.start, e.end), true);
      ctx.stroke();
    } else if (e.type === 'text') {
      const p = this.toScreen(e.p);
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(-(e.angle ?? 0));
      ctx.font = `${Math.max(1, e.size * this.scale)}px ${css('--mn-font-text')}`;
      ctx.fillText(e.text, 0, 0);
      ctx.restore();
    } else if (e.type === 'dim') {
      ctx.setLineDash([]);
      const g = dimGeometry(e);
      const seg = (a, b) => {
        const p = this.toScreen(a);
        const q = this.toScreen(b);
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
      };
      ctx.beginPath();
      seg(g.line[0], g.line[1]);
      seg(g.extA[0], g.extA[1]);
      seg(g.extB[0], g.extB[1]);
      ctx.stroke();
      const arrow = (p, d) => {
        const ah = 2.5;
        const a = this.toScreen(p);
        const l = this.toScreen([
          p[0] - d[0] * ah + d[1] * ah * 0.3,
          p[1] - d[1] * ah - d[0] * ah * 0.3,
        ]);
        const r = this.toScreen([
          p[0] - d[0] * ah - d[1] * ah * 0.3,
          p[1] - d[1] * ah + d[0] * ah * 0.3,
        ]);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(l[0], l[1]);
        ctx.lineTo(r[0], r[1]);
        ctx.closePath();
        ctx.fill();
      };
      arrow(g.line[1], g.dir);
      arrow(g.line[0], [-g.dir[0], -g.dir[1]]);
      const p = this.toScreen(g.textAt);
      ctx.save();
      ctx.translate(p[0], p[1]);
      let ang = g.angle;
      if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI;
      ctx.rotate(-ang);
      ctx.font = `${Math.max(9, (e.textSize ?? 3.5) * this.scale)}px ${css('--mn-font-mono')}`;
      ctx.textAlign = 'center';
      ctx.fillText(e.label ?? fmt(g.value, 2), 0, 0);
      ctx.restore();
    } else {
      const pts = outline(e);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const s = this.toScreen(p);
        if (i) ctx.lineTo(s[0], s[1]);
        else ctx.moveTo(s[0], s[1]);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  paintRubber(col) {
    const c = this.cursor;
    const pts = this.points;
    if (!c || !pts.length) return;
    const ghost = (e) =>
      this.paintEntity({ ...e, style: e.style ?? 'solid' }, col.accent, 1.2, col);
    this.ctx.globalAlpha = 0.8;
    switch (this.tool) {
      case 'line':
        ghost({ type: 'line', a: pts[0], b: c });
        break;
      case 'poly':
        ghost({ type: 'poly', pts: [...pts, c], closed: false });
        break;
      case 'rect':
        ghost({
          type: 'rect',
          a: [Math.min(pts[0][0], c[0]), Math.min(pts[0][1], c[1])],
          b: [Math.max(pts[0][0], c[0]), Math.max(pts[0][1], c[1])],
        });
        break;
      case 'circle':
        ghost({ type: 'circle', c: pts[0], r: dist(pts[0], c) });
        break;
      case 'arc':
        if (pts.length === 1) ghost({ type: 'line', a: pts[0], b: c });
        else {
          const a = arcFrom3(pts[0], pts[1], c);
          if (a) ghost({ type: 'arc', ...a });
          else if (circleFrom3(pts[0], pts[1], c) === null)
            ghost({ type: 'line', a: pts[0], b: c });
        }
        break;
      case 'dim':
        if (pts.length === 1) ghost({ type: 'line', a: pts[0], b: c, style: 'construction' });
        else {
          const kind = this.dimKind(pts[0], pts[1], c);
          const g = dimGeometry({ a: pts[0], b: pts[1], kind, offset: 0 });
          const across = (q) => q[0] * g.n[0] + q[1] * g.n[1];
          const base =
            kind === 'aligned'
              ? across(pts[0])
              : across(c) >= Math.max(across(pts[0]), across(pts[1]))
                ? Math.max(across(pts[0]), across(pts[1]))
                : Math.min(across(pts[0]), across(pts[1]));
          ghost({ type: 'dim', a: pts[0], b: pts[1], kind, offset: across(c) - base });
        }
        break;
      default:
    }
    this.ctx.globalAlpha = 1;
    // Live length and angle next to the cursor.
    const last = pts.at(-1);
    const sp = this.toScreen(c);
    const len = dist(last, c);
    const ang = deg(Math.atan2(c[1] - last[1], c[0] - last[0]));
    const label =
      this.tool === 'circle'
        ? `R ${fmt(len)}`
        : this.tool === 'rect'
          ? `${fmt(Math.abs(c[0] - last[0]))} × ${fmt(Math.abs(c[1] - last[1]))}`
          : `${fmt(len)} · ${fmt(ang, 1)}°`;
    this.ctx.font = `12px ${css('--mn-font-mono')}`;
    const tw = this.ctx.measureText(label).width;
    this.ctx.fillStyle = css('--mn-surface-2');
    this.ctx.fillRect(sp[0] + 12, sp[1] + 10, tw + 10, 20);
    this.ctx.fillStyle = col.ink;
    this.ctx.fillText(label, sp[0] + 17, sp[1] + 24);
  }
}
