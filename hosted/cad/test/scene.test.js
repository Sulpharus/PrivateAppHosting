import { describe, expect, it } from 'vitest';
import { buildScene, geometryKey } from '../js/scene.js';

const plate = [
  {
    id: 's1',
    name: 'Platte',
    kind: 'box',
    op: 'add',
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    w: 40,
    d: 30,
    h: 5,
    material: { id: 'pla' },
  },
  {
    id: 's2',
    name: 'Loch',
    kind: 'cylinder',
    op: 'subtract',
    pos: [20, 15, -1],
    rot: [0, 0, 0],
    r: 4,
    h: 7,
  },
];

describe('buildScene', () => {
  it('groups triangles by the part they belong to, holes included', () => {
    const s = buildScene(plate);
    expect(s.groups.map((g) => g.id)).toEqual(['s1']);
    expect(s.groups[0].data.length % 18).toBe(0);
    expect(s.stats.volume).toBeCloseTo(40 * 30 * 5 - Math.PI * 16 * 5, -1);
  });

  it('ignores names and materials in the geometry key', () => {
    const renamed = plate.map((p) => ({ ...p, name: 'x', material: { id: 'steel' } }));
    expect(geometryKey(renamed)).toBe(geometryKey(plate));
    expect(geometryKey([{ ...plate[0], w: 41 }, plate[1]])).not.toBe(geometryKey(plate));
  });
});
