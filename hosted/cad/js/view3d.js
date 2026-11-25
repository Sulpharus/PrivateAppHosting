// The 3D view: WebGL with flat shading, a build-plate grid, orbit/pan/zoom with mouse, touch and
// keys, and picking (a click selects the solid under the pointer).

import { meshBounds, triangles } from './solid.js';

const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMvp;
varying vec3 vNormal;
void main() {
  vNormal = aNormal;
  gl_Position = uMvp * vec4(aPos, 1.0);
}`;
const FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uLit;
varying vec3 vNormal;
void main() {
  vec3 l1 = normalize(vec3(0.4, -0.7, 0.9));
  vec3 l2 = normalize(vec3(-0.6, 0.5, 0.3));
  float d = max(dot(normalize(vNormal), l1), 0.0) * 0.65 + max(dot(normalize(vNormal), l2), 0.0) * 0.2 + 0.32;
  vec3 c = mix(uColor, uColor * d, uLit);
  gl_FragColor = vec4(c, uAlpha);
}`;

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

/** A CSS colour as [r, g, b] in 0..1 (via a canvas, so any CSS colour works). */
function rgb(colour) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = colour || '#888';
  const hex = c.fillStyle;
  if (hex.startsWith('#'))
    return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const m = hex.match(/[\d.]+/g) ?? ['128', '128', '128'];
  return m.slice(0, 3).map((x) => Number(x) / 255);
}

// --- tiny matrix helpers (column-major) -----------------------------------------------------
const mul = (a, b) => {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return o;
};
const perspective = (fov, aspect, near, far) => {
  const f = 1 / Math.tan(fov / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
};
const lookAt = (eye, c, up) => {
  const z = norm([eye[0] - c[0], eye[1] - c[1], eye[2] - c[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
};

export const PRESETS = {
  iso: [-45, 30],
  front: [-90, 0],
  top: [-90, 89.9],
  right: [0, 0],
};

export class View3d {
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
    this.yaw = -45;
    this.pitch = 30;
    this.dist = 200;
    this.target = [0, 0, 0];
    this.buffers = [];
    this.pointers = new Map();
    this.drag = null;
    if (!this.gl) return;
    this.setup();
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
  }

  get ok() {
    return Boolean(this.gl);
  }

  destroy() {
    this.resizeObserver?.disconnect();
  }

  setup() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    this.prog = p;
    this.loc = {
      pos: gl.getAttribLocation(p, 'aPos'),
      normal: gl.getAttribLocation(p, 'aNormal'),
      mvp: gl.getUniformLocation(p, 'uMvp'),
      color: gl.getUniformLocation(p, 'uColor'),
      alpha: gl.getUniformLocation(p, 'uAlpha'),
      lit: gl.getUniformLocation(p, 'uLit'),
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

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

  /**
   * The scene: `result` is the combined mesh, `solids` the placed meshes per solid id (for picking
   * and highlighting), `paths` toolpaths [{ cut, rapid }].
   */
  setScene({ result, solids, paths = [], selected = [], preview = [] }) {
    this.result = result;
    this.solidMeshes = solids;
    this.paths = paths;
    this.selectedIds = new Set(selected);
    this.previewIds = new Set(preview);
    this.upload();
    this.draw();
  }

  setSelection(ids) {
    this.selectedIds = new Set(ids);
    this.upload();
    this.draw();
  }

  upload() {
    const gl = this.gl;
    if (!gl) return;
    for (const b of this.buffers) gl.deleteBuffer(b.buf);
    this.buffers = [];
    const tri = (mesh) => {
      const tris = triangles(mesh);
      const data = new Float32Array(tris.length * 18);
      let o = 0;
      for (const [a, b, c] of tris) {
        const n = norm(
          cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]),
        );
        for (const v of [a, b, c]) {
          data.set(v, o);
          data.set(n, o + 3);
          o += 6;
        }
      }
      return data;
    };
    const add = (data, mode, role) => {
      if (!data.length) return;
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.buffers.push({ buf, count: data.length / 6, mode, role });
    };
    if (this.result?.length) add(tri(this.result), gl.TRIANGLES, 'result');
    for (const [id, m] of this.solidMeshes ?? []) {
      if (this.selectedIds?.has(id))
        add(tri(m.mesh), gl.TRIANGLES, m.op === 'subtract' ? 'selHole' : 'sel');
      else if (this.previewIds?.has(id)) add(tri(m.mesh), gl.TRIANGLES, 'preview');
      else if (m.op === 'subtract') add(tri(m.mesh), gl.TRIANGLES, 'hole');
    }
    // Build plate grid on z = 0.
    const b = this.result?.length ? meshBounds(this.result) : null;
    const size = Math.max(
      100,
      b
        ? Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[1]), Math.abs(b.max[1])) *
            1.4
        : 100,
    );
    const step = 10 ** Math.floor(Math.log10(size / 5));
    const g = [];
    const ext = Math.ceil(size / step) * step;
    for (let x = -ext; x <= ext + 1e-9; x += step) g.push(x, -ext, 0, 0, 0, 1, x, ext, 0, 0, 0, 1);
    for (let y = -ext; y <= ext + 1e-9; y += step) g.push(-ext, y, 0, 0, 0, 1, ext, y, 0, 0, 0, 1);
    add(new Float32Array(g), gl.LINES, 'grid');
    add(new Float32Array([0, 0, 0, 0, 0, 1, ext, 0, 0, 0, 0, 1]), gl.LINES, 'axisX');
    add(new Float32Array([0, 0, 0, 0, 0, 1, 0, ext, 0, 0, 0, 1]), gl.LINES, 'axisY');
    for (const p of this.paths) {
      const cut = [];
      for (const line of p.cut)
        for (let i = 0; i + 1 < line.length; i++)
          cut.push(...line[i], 0, 0, 1, ...line[i + 1], 0, 0, 1);
      add(new Float32Array(cut), gl.LINES, 'cut');
      const rapid = [];
      for (const [a, c] of p.rapid) rapid.push(...a, 0, 0, 1, ...c, 0, 0, 1);
      add(new Float32Array(rapid), gl.LINES, 'rapid');
    }
  }

  camera() {
    const yaw = (this.yaw * Math.PI) / 180;
    const pitch = (this.pitch * Math.PI) / 180;
    const eye = [
      this.target[0] + this.dist * Math.cos(pitch) * Math.cos(yaw),
      this.target[1] + this.dist * Math.cos(pitch) * Math.sin(yaw),
      this.target[2] + this.dist * Math.sin(pitch),
    ];
    const proj = perspective(
      (35 * Math.PI) / 180,
      this.w / this.h,
      Math.max(0.1, this.dist / 1000),
      this.dist * 100,
    );
    const view = lookAt(eye, this.target, [0, 0, 1]);
    return { eye, mvp: mul(proj, view), proj, view };
  }

  draw() {
    if (!this.gl || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  paint() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bg = rgb(css('--mn-surface'));
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.mvp, false, this.camera().mvp);
    const colours = {
      result: [rgb(css('--mn-line-strong')), 1, 1],
      sel: [rgb(css('--mn-accent')), 0.55, 1],
      selHole: [rgb(css('--mn-bad')), 0.45, 1],
      hole: [rgb(css('--mn-bad')), 0.12, 1],
      preview: [rgb(css('--mn-ok')), 0.5, 1],
      grid: [rgb(css('--mn-line')), 1, 0],
      axisX: [rgb(css('--mn-bad')), 1, 0],
      axisY: [rgb(css('--mn-ok')), 1, 0],
      cut: [rgb(css('--mn-accent')), 1, 0],
      rapid: [rgb(css('--mn-muted')), 0.6, 0],
    };
    // Opaque first, then the see-through overlays without depth writes.
    const order = [
      'grid',
      'axisX',
      'axisY',
      'result',
      'cut',
      'rapid',
      'hole',
      'sel',
      'selHole',
      'preview',
    ];
    for (const role of order) {
      const [c, alpha, lit] = colours[role];
      gl.depthMask(alpha >= 1);
      for (const b of this.buffers.filter((x) => x.role === role)) {
        gl.uniform3fv(this.loc.color, c);
        gl.uniform1f(this.loc.alpha, alpha);
        gl.uniform1f(this.loc.lit, lit);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
        gl.enableVertexAttribArray(this.loc.pos);
        gl.vertexAttribPointer(this.loc.pos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(this.loc.normal);
        gl.vertexAttribPointer(this.loc.normal, 3, gl.FLOAT, false, 24, 12);
        gl.drawArrays(b.mode, 0, b.count);
      }
    }
    gl.depthMask(true);
  }

  /** Points the camera at the whole model. */
  fitAll() {
    if (!this.canvas.offsetParent) {
      this.wantFit = true;
      return;
    }
    this.syncSize();
    const all = [...(this.result ?? [])];
    for (const p of this.paths ?? []) for (const l of p.cut) all.push({ v: l });
    const b = all.length ? meshBounds(all) : null;
    if (!b) {
      this.target = [0, 0, 0];
      this.dist = 200;
    } else {
      this.target = b.min.map((m, k) => (m + b.max[k]) / 2);
      const r = Math.hypot(...b.size) / 2 || 10;
      this.dist = (r / Math.tan((17.5 * Math.PI) / 180)) * 1.15 * Math.max(1, this.h / this.w);
    }
    this.draw();
  }

  preset(name) {
    [this.yaw, this.pitch] = PRESETS[name];
    this.fitAll();
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.4;
    this.pitch = Math.max(-89.9, Math.min(89.9, this.pitch + dy * 0.4));
    this.draw();
  }

  pan(dx, dy) {
    const yaw = (this.yaw * Math.PI) / 180;
    const pitch = (this.pitch * Math.PI) / 180;
    const k = (this.dist * 0.0012 * 600) / this.h;
    const right = [-Math.sin(yaw), Math.cos(yaw), 0];
    const up = [
      -Math.sin(pitch) * Math.cos(yaw),
      -Math.sin(pitch) * Math.sin(yaw),
      Math.cos(pitch),
    ];
    for (let i = 0; i < 3; i++) this.target[i] += (-dx * right[i] + dy * up[i]) * k;
    this.draw();
  }

  zoom(f) {
    this.dist = Math.min(1e6, Math.max(1, this.dist * f));
    this.draw();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.drag = {
        start: [e.clientX, e.clientY],
        last: [e.clientX, e.clientY],
        pan: e.button === 2 || e.button === 1 || e.shiftKey,
        moved: false,
      };
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId) || !this.drag) return;
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (this.drag.pinch) {
          this.zoom(this.drag.pinch / d);
          this.pan((e.clientX - prev[0]) / 2, (e.clientY - prev[1]) / 2);
        }
        this.drag.pinch = d;
        this.drag.moved = true;
        return;
      }
      const dx = e.clientX - this.drag.last[0];
      const dy = e.clientY - this.drag.last[1];
      this.drag.last = [e.clientX, e.clientY];
      if (Math.hypot(e.clientX - this.drag.start[0], e.clientY - this.drag.start[1]) > 4)
        this.drag.moved = true;
      if (this.drag.pan) this.pan(dx, dy);
      else this.orbit(dx, dy);
    });
    c.addEventListener('pointerup', (e) => {
      this.pointers.delete(e.pointerId);
      const d = this.drag;
      if (this.pointers.size === 0) this.drag = null;
      if (d && !d.moved && e.button === 0) {
        const r = c.getBoundingClientRect();
        this.host.pick(
          this.pick(e.clientX - r.left, e.clientY - r.top),
          e.shiftKey || e.ctrlKey || e.metaKey,
        );
      }
    });
    c.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(e.deltaY * 0.0015));
      },
      { passive: false },
    );
    c.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 20 : 8;
      const map = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      if (map[e.key]) {
        e.preventDefault();
        this.orbit(...map[e.key]);
      } else if (e.key === '+' || e.key === '=') this.zoom(0.85);
      else if (e.key === '-') this.zoom(1.15);
    });
  }

  /** The id of the nearest solid under the screen point, or null. */
  pick(x, y) {
    const { eye, proj, view } = this.camera();
    // Ray direction from the inverse of the view and projection (by hand, no matrix inverse).
    const ndc = [(x / this.w) * 2 - 1, 1 - (y / this.h) * 2];
    const dirCam = [ndc[0] / proj[0], ndc[1] / proj[5], -1];
    const right = [view[0], view[4], view[8]];
    const up = [view[1], view[5], view[9]];
    const back = [view[2], view[6], view[10]];
    const dir = norm(
      [0, 1, 2].map((i) => right[i] * dirCam[0] + up[i] * dirCam[1] + back[i] * dirCam[2]),
    );
    let best = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const [id, m] of this.solidMeshes ?? []) {
      for (const [a, b, c] of triangles(m.mesh)) {
        const t = rayTri(eye, dir, a, b, c);
        if (t !== null && t < bestT) {
          bestT = t;
          best = id;
        }
      }
    }
    return best;
  }

  /** The current picture as a PNG data URL (for thumbnails). */
  snapshot() {
    this.paint();
    return this.canvas.toDataURL('image/png');
  }
}

function rayTri(o, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = cross(d, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = dot(s, p) * inv;
  if (u < 0 || u > 1) return null;
  const q = cross(s, e1);
  const v = dot(d, q) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, q) * inv;
  return t > 1e-6 ? t : null;
}
