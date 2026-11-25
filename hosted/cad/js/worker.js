// Builds the 3D scene off the page, so editing and orbiting never wait for CSG. Keeps imported
// meshes it was sent once, and the last results by geometry: undo, redo and material changes
// come back at once.

import { buildScene, geometryKey } from './scene.js';

const meshes = new Map();
const results = new Map();
const KEEP = 8;

self.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'mesh') {
    meshes.set(msg.id, msg.polys);
    return;
  }
  if (msg.type !== 'build') return;
  try {
    const key = geometryKey(msg.solids);
    let r = results.get(key);
    if (!r) {
      r = buildScene(msg.solids, meshes);
      results.set(key, r);
      if (results.size > KEEP) results.delete(results.keys().next().value);
    } else {
      results.delete(key);
      results.set(key, r);
    }
    // Copies of the buffers are handed over (transferred, not copied again); the cache keeps its own.
    const groups = r.groups.map((g) => ({ id: g.id, data: g.data.slice() }));
    self.postMessage(
      { job: msg.job, mesh: r.mesh, bounds: r.bounds, stats: r.stats, groups },
      groups.map((g) => g.data.buffer),
    );
  } catch (err) {
    self.postMessage({ job: msg.job, error: String(err?.message ?? err) });
  }
});
