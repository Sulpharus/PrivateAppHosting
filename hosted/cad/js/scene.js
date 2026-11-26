// The finished model for display and checks: CSG of all solids, smooth normals, one render group
// per solid (for its material) and the facts shown in the panel. Pure, so it runs in the worker
// (js/worker.js) and, where workers are not available, on the page. Tested in test/scene.test.js.

import {
  combine,
  combineByPart,
  interference,
  meshBounds,
  openEdges,
  overhangArea,
  smoothNormals,
  triangles,
  volume,
} from './solid.js';

/** What changes the geometry of the solids (names and materials do not). */
export const geometryKey = (solids) =>
  JSON.stringify(solids.map(({ name: _n, material: _m, ...g }) => g));

export function buildScene(solids, meshes = new Map()) {
  const mesh = combine(solids, meshes);
  const tris = triangles(mesh);
  // Owner of each triangle, in the same order as triangles().
  const owners = [];
  for (const p of mesh) for (let i = 1; i + 1 < p.v.length; i++) owners.push(p.s ?? '');
  const normals = smoothNormals(tris);
  const count = new Map();
  for (const id of owners) count.set(id, (count.get(id) ?? 0) + 1);
  const data = new Map([...count].map(([id, n]) => [id, { data: new Float32Array(n * 18), o: 0 }]));
  tris.forEach((t, i) => {
    const g = data.get(owners[i]);
    for (let k = 0; k < 3; k++) {
      g.data.set(t[k], g.o);
      g.data.set(normals[i][k], g.o + 3);
      g.o += 6;
    }
  });
  const bounds = meshBounds(mesh);
  const hasImported = solids.some((s) => s.kind === 'mesh' && !s.hidden);
  return {
    mesh,
    groups: [...data].map(([id, g]) => ({ id, data: g.data })),
    bounds,
    stats: bounds
      ? {
          volume: volume(mesh),
          open: hasImported ? openEdges(mesh) : 0,
          overhang: overhangArea(mesh),
        }
      : null,
  };
}

/**
 * The fit check of an assembly: overlaps between parts as { a, b, volume, data } with the shared
 * region as flat-shaded render data (red in the view).
 */
export function checkFit(solids, meshes = new Map()) {
  return interference(combineByPart(solids, meshes)).map((c) => {
    const tris = triangles(c.mesh);
    const data = new Float32Array(tris.length * 18);
    let o = 0;
    for (const [a, b, d] of tris) {
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const l = Math.hypot(...n) || 1;
      for (const v of [a, b, d]) {
        data.set(v, o);
        data.set([n[0] / l, n[1] / l, n[2] / l], o + 3);
        o += 6;
      }
    }
    return { a: c.a, b: c.b, volume: c.volume, data };
  });
}
