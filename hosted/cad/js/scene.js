// The finished model for display and checks: CSG of all solids, smooth normals, one render group
// per solid (for its material) and the facts shown in the panel. Pure, so it runs in the worker
// (js/worker.js) and, where workers are not available, on the page. Tested in test/scene.test.js.

import {
  combine,
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
