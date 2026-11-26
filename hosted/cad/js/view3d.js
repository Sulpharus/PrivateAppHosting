// The 3D view (WebGL 1, so it runs on old and weak graphics too). Two modes:
//   fast    — smooth-shaded parts in their material colour, a build-plate grid.
//   quality — physically based lighting (GGX), soft shadows from a shadow map, reflections of a
//             studio environment on metal and gloss, a mirroring floor, and procedural surface
//             textures (layer lines of a print, brushed or milled metal, grain, wood).
// It draws only when something changed (no render loop). The shadow map is made only when the
// geometry changes, never while orbiting. While the view is being dragged in quality mode, the
// soft shadow filter takes one sample instead of sixteen and the floor mirror pauses; the still
// picture is always drawn in full quality 150 ms after the last movement.

import { linearRgb } from './materials.js';
import { meshBounds, triangles } from './solid.js';

const VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMvp;
uniform mat4 uLight;
uniform float uMirror;
uniform float uFloorZ;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vLight;
void main() {
  vec3 p = aPos;
  vec3 n = aNormal;
  if (uMirror > 0.5) { p.z = 2.0 * uFloorZ - p.z; n.z = -n.z; }
  vWorld = p;
  vNormal = n;
  vLight = uLight * vec4(p, 1.0);
  gl_Position = uMvp * vec4(p, 1.0);
}`;

const FS_FAST = `
precision mediump float;
uniform vec3 uBase;
uniform float uAlpha;
uniform float uLit;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float d = max(dot(n, normalize(vec3(0.4, -0.7, 0.9))), 0.0) * 0.62
          + max(dot(n, normalize(vec3(-0.6, 0.5, 0.3))), 0.0) * 0.18 + 0.3;
  vec3 c = mix(uBase, uBase * d, uLit);
  gl_FragColor = vec4(c, uAlpha);
}`;

const FS_QUALITY = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 uBase;
uniform float uMetal;
uniform float uRough;
uniform float uTex;      // 0 none, 1 layers, 2 brushed, 3 milled, 4 grain, 5 wood
uniform float uLayer;
uniform float uAlpha;
uniform vec3 uEye;
uniform vec3 uSun;
uniform sampler2D uShadow;
uniform float uTexel;
uniform float uSoft;
uniform vec3 uSky;
uniform vec3 uGround;
uniform float uPxPerMm;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vLight;

const float PI = 3.14159265;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float unpack(vec4 c) { return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }

float shadowAt(vec2 uv, float z) { return z > unpack(texture2D(uShadow, uv)) ? 0.0 : 1.0; }

float shadow(vec3 n) {
  vec3 s = vLight.xyz / vLight.w * 0.5 + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
  float z = s.z - (0.0012 + 0.003 * (1.0 - max(dot(n, uSun), 0.0)));
  if (uSoft < 0.5) return shadowAt(s.xy, z);
  float sum = 0.0;
  for (int i = 0; i < 4; i++)
    for (int j = 0; j < 4; j++)
      sum += shadowAt(s.xy + (vec2(float(i), float(j)) - 1.5) * uTexel * 1.6, z);
  return sum / 16.0;
}

// A photo studio: bright ceiling, two soft boxes, darker floor.
vec3 env(vec3 r, float rough) {
  float up = r.z * 0.5 + 0.5;
  vec3 c = mix(uGround, uSky, smoothstep(0.35, 0.65, up));
  float spread = 0.15 + rough * 0.6;
  float box1 = smoothstep(1.0 - spread * 0.35, 1.0, dot(r, normalize(vec3(-0.7, -0.6, 0.5))));
  float box2 = smoothstep(1.0 - spread * 0.35, 1.0, dot(r, normalize(vec3(0.8, 0.3, 0.6))));
  float top = smoothstep(0.85 - spread * 0.3, 1.0, r.z);
  return c + vec3(1.0) * (box1 * 3.0 + box2 * 1.6 + top * 1.2) * (1.0 - rough * 0.65);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vNormal);
  vec3 p = vWorld;
  vec3 base = uBase;
  float rough = uRough;
  // Pixels per millimetre at this point: detail finer than about two pixels cannot be shown
  // without shimmering, so it fades into the roughness it causes (how it looks from afar).
  float px = uPxPerMm / max(distance(uEye, p), 0.001);
  // Procedural surface detail, in millimetres of the part.
  if (uTex > 0.5 && uTex < 1.5) {
    // Layer lines: ridges every layer height along Z, only on walls.
    float k = smoothstep(1.5, 4.0, uLayer * px);
    float ph = 6.2831853 * p.z / uLayer;
    vec3 t = vec3(0.0, 0.0, 1.0) - n * n.z;
    n = normalize(n - t * cos(ph) * 0.22 * k);
    rough += 0.06 * sin(ph) * k + 0.05 * (1.0 - k) * length(t);
  } else if (uTex > 1.5 && uTex < 2.5) {
    float k = smoothstep(1.5, 4.0, px / 40.0);
    float b = noise(p * vec3(0.6, 40.0, 40.0)) - 0.5;
    n = normalize(n + vec3(0.0, b, b) * 0.08 * k);
    rough += b * 0.12 * k + 0.04 * (1.0 - k);
  } else if (uTex > 2.5 && uTex < 3.5) {
    float k = smoothstep(1.5, 4.0, px / 1.4);
    float m = sin(length(p.xy - floor(p.xy / 8.0) * 8.0 - 4.0) * 9.0);
    n = normalize(n + vec3(m * 0.025 * k));
    rough += m * 0.05 * k;
  } else if (uTex > 3.5 && uTex < 4.5) {
    float k = smoothstep(1.5, 4.0, px / 9.0);
    float g = noise(p * 9.0) - 0.5;
    n = normalize(n + vec3(g, -g, g * 0.5) * 0.12 * k);
    rough += 0.08 * (1.0 - k);
  } else if (uTex > 4.5 && uTex < 5.5) {
    float ring = fract(length(p.xz * vec2(0.22, 0.05)) * 2.0 + noise(p * 0.3) * 1.5);
    base *= 0.78 + 0.22 * smoothstep(0.0, 0.6, ring);
  }
  rough = clamp(rough, 0.03, 1.0);
  vec3 v = normalize(uEye - p);
  if (dot(n, v) < 0.0) n = -n;
  vec3 f0 = mix(vec3(0.04), base, uMetal);
  float a = rough * rough;
  float vis = shadow(n);
  vec3 col = vec3(0.0);
  // Key light (casts shadows) and fill light.
  for (int k = 0; k < 2; k++) {
    vec3 l = k == 0 ? uSun : normalize(vec3(-0.6, 0.7, 0.35));
    float strength = k == 0 ? 2.0 * vis : 0.35;
    vec3 h = normalize(l + v);
    float nl = max(dot(n, l), 0.0);
    float nh = max(dot(n, h), 0.0);
    float nv = max(dot(n, v), 0.001);
    float d = a * a / (PI * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
    float kk = (rough + 1.0) * (rough + 1.0) / 8.0;
    float g = nl / (nl * (1.0 - kk) + kk) * nv / (nv * (1.0 - kk) + kk);
    vec3 f = f0 + (1.0 - f0) * pow(1.0 - max(dot(h, v), 0.0), 5.0);
    vec3 spec = d * g * f / max(4.0 * nl * nv, 0.001);
    vec3 diff = (1.0 - f) * (1.0 - uMetal) * base / PI;
    col += (diff + spec) * nl * strength * PI;
  }
  // Reflections of the environment and its soft light on the surface.
  vec3 r = reflect(-v, n);
  vec3 fe = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += env(r, rough) * fe * (0.55 + 0.45 * vis);
  col += mix(uGround, uSky, n.z * 0.5 + 0.5) * base * (1.0 - uMetal) * 0.35;
  col = aces(col * 0.62);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), uAlpha);
}`;

const SHADOW_VS = `
attribute vec3 aPos;
uniform mat4 uLight;
void main() { gl_Position = uLight * vec4(aPos, 1.0); }`;
const SHADOW_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
void main() {
  vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * gl_FragCoord.z);
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
}`;

const css = (name) => getComputedStyle(document.body).getPropertyValue(name).trim();

/** A CSS colour as linear RGB 0..1. */
function rgb(colour) {
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = colour || 'gray';
  const v = c.fillStyle;
  const hex = v.startsWith('#')
    ? v
    : `#${(v.match(/\d+/g) ?? ['128', '128', '128'])
        .slice(0, 3)
        .map((x) => Number(x).toString(16).padStart(2, '0'))
        .join('')}`;
  return linearRgb(hex);
}
const srgb = (lin) => lin.map((c) => c ** (1 / 2.2));

// --- small matrix helpers (column-major) ----------------------------------------------------
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
const ortho = (r, near, far) => {
  const o = new Float32Array(16);
  o[0] = 1 / r;
  o[5] = 1 / r;
  o[10] = -2 / (far - near);
  o[14] = -(far + near) / (far - near);
  o[15] = 1;
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

const TEX = { none: 0, layers: 1, brushed: 2, milled: 3, grain: 4, wood: 5 };
const SUN = norm([0.45, -0.55, 1]);
const FLOOR = { colour: '#9a9c9e', metal: 0, rough: 0.3, tex: 'none' };

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
    this.groups = [];
    this.pointers = new Map();
    this.drag = null;
    this.quality = false;
    this.interacting = false;
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
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    clearTimeout(this.idleTimer);
    const gl = this.gl;
    if (!gl) return;
    for (const b of [...this.buffers, ...this.groups]) gl.deleteBuffer(b.buf);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
    const loc = {
      pos: gl.getAttribLocation(p, 'aPos'),
      normal: gl.getAttribLocation(p, 'aNormal'),
    };
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i).name;
      loc[name] = gl.getUniformLocation(p, name);
    }
    return { p, loc };
  }

  setup() {
    const gl = this.gl;
    this.fast = this.program(VS, FS_FAST);
    this.hq = this.program(VS, FS_QUALITY);
    this.shadowProg = this.program(SHADOW_VS, SHADOW_FS);
    // The quality mode needs its shaders and a shadow target; without them it stays fast.
    this.canQuality = Boolean(this.hq && this.shadowProg);
    if (this.canQuality) {
      this.shadowSize = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      this.shadowTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        this.shadowSize,
        this.shadowSize,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.shadowFbo = gl.createFramebuffer();
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(
        gl.RENDERBUFFER,
        gl.DEPTH_COMPONENT16,
        this.shadowSize,
        this.shadowSize,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        this.shadowTex,
        0,
      );
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      this.canQuality = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Switches the realistic view; returns whether it is on (false when the device cannot). */
  setQuality(on) {
    this.quality = Boolean(on) && Boolean(this.canQuality);
    this.shadowDirty = true;
    this.draw();
    return this.quality;
  }

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
    if (!this.gl) return;
    this.syncSize();
    if (this.wantFit && this.canvas.offsetParent) {
      this.wantFit = false;
      this.fitAll();
      return;
    }
    this.draw();
  }

  buffer(data) {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  /**
   * The finished model as render groups, one per solid id: { id, data (interleaved position and
   * smooth normal, Float32Array), material }. Uploaded once per geometry change.
   */
  setModel({ groups, bounds, paths = [] }) {
    const gl = this.gl;
    if (!gl) return;
    for (const g of this.groups) gl.deleteBuffer(g.buf);
    this.groups = groups
      .filter((g) => g.data.length)
      .map((g) => ({ ...g, buf: this.buffer(g.data), count: g.data.length / 6 }));
    this.bounds = bounds;
    this.paths = paths;
    this.shadowDirty = true;
    this.uploadStatic();
    this.draw();
  }

  /** Only the materials changed: nothing is uploaded again. */
  setMaterials(materials) {
    for (const g of this.groups) g.material = materials.get(g.id) ?? g.material;
    this.draw();
  }

  /** Overlays: the selected solids, holes (see-through) and the assistant's preview. */
  setOverlays({ solids, selected = [], preview = [] }) {
    const gl = this.gl;
    if (!gl) return;
    this.solidMeshes = solids;
    for (const b of this.buffers.filter((x) => x.overlay && !x.keep)) gl.deleteBuffer(b.buf);
    this.buffers = this.buffers.filter((x) => !x.overlay || x.keep);
    const sel = new Set(selected);
    const pre = new Set(preview);
    for (const [id, m] of solids ?? []) {
      const role = sel.has(id)
        ? m.op === 'subtract'
          ? 'selHole'
          : 'sel'
        : pre.has(id)
          ? 'preview'
          : m.op === 'subtract'
            ? 'hole'
            : null;
      if (!role) continue;
      const data = flat(m.mesh);
      if (data.length)
        this.buffers.push({
          buf: this.buffer(data),
          count: data.length / 6,
          mode: gl.TRIANGLES,
          role,
          overlay: true,
        });
    }
    this.draw();
  }

  /** Overlaps found by the fit check, drawn red and visible through the parts. */
  setClashes(list) {
    const gl = this.gl;
    if (!gl) return;
    for (const b of this.buffers.filter((x) => x.role === 'clash')) gl.deleteBuffer(b.buf);
    this.buffers = this.buffers.filter((x) => x.role !== 'clash');
    for (const data of list)
      if (data.length)
        this.buffers.push({
          buf: this.buffer(data),
          count: data.length / 6,
          mode: gl.TRIANGLES,
          role: 'clash',
          overlay: true,
          keep: true,
        });
    this.draw();
  }

  /** Grid, axes, floor and toolpaths: they change with the model bounds only. */
  uploadStatic() {
    const gl = this.gl;
    for (const b of this.buffers.filter((x) => !x.overlay)) gl.deleteBuffer(b.buf);
    this.buffers = this.buffers.filter((x) => x.overlay);
    const add = (data, mode, role) => {
      if (data.length)
        this.buffers.push({ buf: this.buffer(data), count: data.length / 6, mode, role });
    };
    const b = this.bounds;
    const size = Math.max(
      100,
      b
        ? Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[1]), Math.abs(b.max[1])) *
            1.4
        : 100,
    );
    const step = 10 ** Math.floor(Math.log10(size / 5));
    const ext = Math.ceil(size / step) * step;
    const g = [];
    for (let x = -ext; x <= ext + 1e-9; x += step) g.push(x, -ext, 0, 0, 0, 1, x, ext, 0, 0, 0, 1);
    for (let y = -ext; y <= ext + 1e-9; y += step) g.push(-ext, y, 0, 0, 0, 1, ext, y, 0, 0, 0, 1);
    add(new Float32Array(g), gl.LINES, 'grid');
    add(new Float32Array([0, 0, 0, 0, 0, 1, ext, 0, 0, 0, 0, 1]), gl.LINES, 'axisX');
    add(new Float32Array([0, 0, 0, 0, 0, 1, 0, ext, 0, 0, 0, 1]), gl.LINES, 'axisY');
    // Studio floor for the quality mode, at the lowest point of the model.
    const fz = b ? Math.min(0, b.min[2]) : 0;
    this.floorZ = fz;
    const F = ext * 4;
    add(
      new Float32Array([
        -F,
        -F,
        fz,
        0,
        0,
        1,
        F,
        -F,
        fz,
        0,
        0,
        1,
        F,
        F,
        fz,
        0,
        0,
        1,
        -F,
        -F,
        fz,
        0,
        0,
        1,
        F,
        F,
        fz,
        0,
        0,
        1,
        -F,
        F,
        fz,
        0,
        0,
        1,
      ]),
      gl.TRIANGLES,
      'floor',
    );
    for (const p of this.paths ?? []) {
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

  lightMatrix() {
    const b = this.bounds;
    const c = b ? b.min.map((m, k) => (m + b.max[k]) / 2) : [0, 0, 0];
    const r = b ? Math.max(Math.hypot(...b.min.map((m, k) => b.max[k] - m)) * 0.75, 10) : 50;
    const eye = [c[0] + SUN[0] * r * 3, c[1] + SUN[1] * r * 3, c[2] + SUN[2] * r * 3];
    return mul(ortho(r * 1.6, r * 0.5, r * 6), lookAt(eye, c, [0, 0, 1]));
  }

  draw() {
    if (!this.gl || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.paint();
    });
  }

  bindAttribs(loc, b) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 24, 0);
    if (loc.normal >= 0) {
      gl.enableVertexAttribArray(loc.normal);
      gl.vertexAttribPointer(loc.normal, 3, gl.FLOAT, false, 24, 12);
    }
  }

  paintShadow() {
    const gl = this.gl;
    const { p, loc } = this.shadowProg;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    // Only back faces go into the shadow map: lit surfaces never shadow themselves (no acne).
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.useProgram(p);
    gl.uniformMatrix4fv(loc.uLight, false, this.lightMatrix());
    for (const g of this.groups) {
      gl.bindBuffer(gl.ARRAY_BUFFER, g.buf);
      gl.enableVertexAttribArray(loc.pos);
      gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 24, 0);
      gl.drawArrays(gl.TRIANGLES, 0, g.count);
    }
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowDirty = false;
  }

  paint() {
    const gl = this.gl;
    if (!gl) return;
    if (this.quality && this.shadowDirty) this.paintShadow();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const bg = srgb(rgb(css('--mn-surface')));
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const cam = this.camera();
    if (this.quality) this.paintQuality(cam);
    else this.paintFast(cam);
    this.paintOverlays(cam);
  }

  uniformsCommon(prog, cam, mirror = 0) {
    const gl = this.gl;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.loc.uMvp, false, cam.mvp);
    if (prog.loc.uLight) gl.uniformMatrix4fv(prog.loc.uLight, false, this.lightMatrix());
    gl.uniform1f(prog.loc.uMirror, mirror);
    gl.uniform1f(prog.loc.uFloorZ, this.floorZ ?? 0);
  }

  paintFast(cam) {
    const gl = this.gl;
    const prog = this.fast;
    this.uniformsCommon(prog, cam);
    gl.depthMask(true);
    for (const role of ['grid', 'axisX', 'axisY'])
      this.paintRole(prog, role, this.lineColour(role), 1, 0);
    for (const g of this.groups) {
      gl.uniform3fv(prog.loc.uBase, srgb(linearRgb(g.material.colour)));
      gl.uniform1f(prog.loc.uAlpha, 1);
      gl.uniform1f(prog.loc.uLit, 1);
      this.bindAttribs(prog.loc, g);
      gl.drawArrays(gl.TRIANGLES, 0, g.count);
    }
    for (const role of ['cut', 'rapid'])
      this.paintRole(prog, role, this.lineColour(role), role === 'rapid' ? 0.6 : 1, 0);
  }

  paintQuality(cam) {
    const gl = this.gl;
    const prog = this.hq;
    // A fixed studio, the same in light and dark mode: the part looks the same on every screen.
    const sky = [0.62, 0.64, 0.66];
    const ground = [0.1, 0.1, 0.1];
    const setMaterial = (m, alpha = 1, base = null) => {
      gl.uniform3fv(prog.loc.uBase, base ?? linearRgb(m.colour));
      gl.uniform1f(prog.loc.uMetal, m.metal);
      gl.uniform1f(prog.loc.uRough, m.rough);
      gl.uniform1f(prog.loc.uTex, TEX[m.tex] ?? 0);
      gl.uniform1f(prog.loc.uLayer, m.layer ?? 0.2);
      gl.uniform1f(prog.loc.uAlpha, alpha);
    };
    const begin = (mirror) => {
      this.uniformsCommon(prog, cam, mirror);
      gl.uniform3fv(prog.loc.uEye, cam.eye);
      gl.uniform3fv(prog.loc.uSun, SUN);
      gl.uniform3fv(prog.loc.uSky, sky);
      gl.uniform3fv(prog.loc.uGround, ground);
      gl.uniform1f(prog.loc.uTexel, 1 / (this.shadowSize ?? 2048));
      gl.uniform1f(prog.loc.uSoft, this.interacting ? 0 : 1);
      gl.uniform1f(prog.loc.uPxPerMm, this.canvas.height / (2 * Math.tan((17.5 * Math.PI) / 180)));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
      gl.uniform1i(prog.loc.uShadow, 0);
    };
    const drawGroups = () => {
      for (const g of this.groups) {
        setMaterial(g.material);
        this.bindAttribs(prog.loc, g);
        gl.drawArrays(gl.TRIANGLES, 0, g.count);
      }
    };
    // 1. The model mirrored under the floor (seen through the glossy floor), 2. the floor with
    // the shadows, partly see-through, 3. the model itself.
    gl.depthMask(true);
    if (!this.interacting) {
      begin(1);
      drawGroups();
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    begin(0);
    setMaterial(FLOOR, this.interacting ? 1 : 0.82);
    for (const b of this.buffers.filter((x) => x.role === 'floor')) {
      this.bindAttribs(prog.loc, b);
      gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
    drawGroups();
    const fast = this.fast;
    this.uniformsCommon(fast, cam);
    for (const role of ['cut', 'rapid'])
      this.paintRole(fast, role, this.lineColour(role), role === 'rapid' ? 0.6 : 1, 0);
  }

  lineColour(role) {
    const token = {
      grid: '--mn-line',
      axisX: '--mn-bad',
      axisY: '--mn-ok',
      cut: '--mn-accent',
      rapid: '--mn-muted',
    }[role];
    return srgb(rgb(css(token)));
  }

  paintRole(prog, role, colour, alpha, lit) {
    const gl = this.gl;
    for (const b of this.buffers.filter((x) => x.role === role)) {
      gl.uniform3fv(prog.loc.uBase, colour);
      gl.uniform1f(prog.loc.uAlpha, alpha);
      gl.uniform1f(prog.loc.uLit, lit);
      this.bindAttribs(prog.loc, b);
      gl.drawArrays(b.mode, 0, b.count);
    }
  }

  paintOverlays(cam) {
    const gl = this.gl;
    const prog = this.fast;
    this.uniformsCommon(prog, cam);
    gl.depthMask(false);
    const tok = (n) => srgb(rgb(css(n)));
    this.paintRole(prog, 'hole', tok('--mn-bad'), 0.12, 1);
    this.paintRole(prog, 'sel', tok('--mn-accent'), 0.5, 1);
    this.paintRole(prog, 'selHole', tok('--mn-bad'), 0.45, 1);
    this.paintRole(prog, 'preview', tok('--mn-ok'), 0.5, 1);
    gl.disable(gl.DEPTH_TEST);
    this.paintRole(prog, 'clash', tok('--mn-bad'), 0.75, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }

  /** Points the camera at the whole model. */
  fitAll() {
    if (!this.canvas.offsetParent) {
      this.wantFit = true;
      return;
    }
    this.syncSize();
    let b = this.bounds;
    for (const p of this.paths ?? []) {
      const pb = meshBounds(p.cut.map((l) => ({ v: l })));
      if (!pb) continue;
      b = b
        ? {
            min: b.min.map((m, k) => Math.min(m, pb.min[k])),
            max: b.max.map((m, k) => Math.max(m, pb.max[k])),
          }
        : pb;
    }
    if (!b) {
      this.target = [0, 0, 0];
      this.dist = 200;
    } else {
      const size = b.min.map((m, k) => b.max[k] - m);
      this.target = b.min.map((m, k) => (m + b.max[k]) / 2);
      const r = Math.hypot(...size) / 2 || 10;
      this.dist = (r / Math.tan((17.5 * Math.PI) / 180)) * 1.15 * Math.max(1, this.h / this.w);
    }
    this.draw();
  }

  preset(name) {
    [this.yaw, this.pitch] = PRESETS[name];
    this.fitAll();
  }

  /** While the view moves, quality mode draws a lighter picture; full quality 150 ms after. */
  moving() {
    if (this.quality) this.interacting = true;
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.interacting = false;
      this.draw();
    }, 150);
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.4;
    this.pitch = Math.max(-89.9, Math.min(89.9, this.pitch + dy * 0.4));
    this.moving();
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
    this.moving();
    this.draw();
  }

  zoom(f) {
    this.dist = Math.min(1e6, Math.max(1, this.dist * f));
    this.moving();
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
      // A cheap test against the box first, then the triangles.
      if (m.bounds && !rayBox(eye, dir, m.bounds.min, m.bounds.max)) continue;
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
}

/** Flat-shaded interleaved data of a polygon mesh (for the see-through overlays). */
function flat(mesh) {
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
}

function rayBox(o, d, min, max) {
  let t0 = Number.NEGATIVE_INFINITY;
  let t1 = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < min[k] || o[k] > max[k]) return false;
      continue;
    }
    let a = (min[k] - o[k]) / d[k];
    let b = (max[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  }
  return t1 >= Math.max(t0, 0);
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
