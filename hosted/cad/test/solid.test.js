import { describe, expect, it } from 'vitest';
import { box, combine, cylinder, meshBounds, openEdges, subtract, volume } from '../js/solid.js';

describe('solids', () => {
  it('a box has the right volume and is closed', () => {
    const b = box(10, 20, 30);
    expect(volume(b)).toBeCloseTo(6000, 6);
    expect(openEdges(b)).toBe(0);
  });

  it('a cylinder approaches πr²h', () => {
    expect(volume(cylinder(5, 10, 128))).toBeCloseTo(Math.PI * 250, 0);
  });

  it('subtracting a box leaves the difference', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10).map((p) => ({ v: p.v.map((v) => [v[0] + 5, v[1], v[2]]) }));
    expect(volume(subtract(a, b))).toBeCloseTo(500, 4);
  });

  it('combines placed solids: plate with a hole', () => {
    const solids = [
      { id: 'p', kind: 'box', op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], w: 40, d: 30, h: 5 },
      { id: 'h', kind: 'cylinder', op: 'subtract', pos: [20, 15, -1], rot: [0, 0, 0], r: 4, h: 7 },
    ];
    const m = combine(solids);
    const b = meshBounds(m);
    expect(b.size.map((x) => Math.round(x * 1000) / 1000)).toEqual([40, 30, 5]);
    expect(volume(m)).toBeCloseTo(40 * 30 * 5 - Math.PI * 16 * 5, -1);
  });
});

describe('threads', () => {
  it('an M6 × 20 thread is a closed solid between minor and major cylinder', async () => {
    const { thread, openEdges, volume, meshBounds } = await import('../js/solid.js');
    const m = thread(6, 1, 20);
    expect(openEdges(m)).toBe(0);
    const b = meshBounds(m);
    expect(b.size[2]).toBeCloseTo(20, 6);
    expect(b.size[0]).toBeCloseTo(6, 2);
    const v = volume(m);
    const rMin = 3 - 0.5412658773652741;
    expect(v).toBeGreaterThan(Math.PI * rMin * rMin * 20);
    expect(v).toBeLessThan(Math.PI * 9 * 20);
  });

  it('left-hand and offset threads stay closed', async () => {
    const { thread, openEdges, meshBounds } = await import('../js/solid.js');
    expect(openEdges(thread(8, 1.25, 13.3, { left: true }))).toBe(0);
    const b = meshBounds(thread(8, 1.25, 10, { offset: 0.2 }));
    expect(b.size[0]).toBeCloseTo(8.4, 2);
  });

  it('a tap cut into a block leaves an internal thread', async () => {
    const { combine, volume } = await import('../js/solid.js');
    const solids = [
      { id: 'b', kind: 'box', op: 'add', pos: [-8, -8, 0], rot: [0, 0, 0], w: 16, d: 16, h: 8 },
      {
        id: 't',
        kind: 'thread',
        op: 'subtract',
        pos: [0, 0, -1],
        rot: [0, 0, 0],
        d: 6,
        pitch: 1,
        h: 10,
        clearance: 0,
      },
    ];
    const m = combine(solids);
    expect(volume(m)).toBeLessThan(16 * 16 * 8 - Math.PI * 2.4 * 2.4 * 8);
    expect(m.every((p) => p.s === 'b')).toBe(true);
  }, 30_000);
});

describe('thread closure', () => {
  const exactOpen = (mesh) => {
    const key = (p) => p.join(',');
    const count = new Map();
    for (const { v } of mesh)
      for (let i = 0; i < v.length; i++) {
        const a = key(v[i]);
        const b = key(v[(i + 1) % v.length]);
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    return [...count.values()].filter((c) => c !== 2).length;
  };
  for (const [d, p, l] of [
    [3, 0.5, 10],
    [3, 0.5, 12],
    [4, 0.7, 12],
    [6, 1, 20],
    [8, 1.25, 20],
    [10, 1.5, 30],
    [12, 1.75, 25],
    [6, 1, 2],
    [6, 1, 2 + 1e-7],
    [5, 0.8, 7.3],
  ])
    for (const offset of [0, 0.15])
      for (const left of [false, true])
        it(`M${d}×${p}×${l} offset ${offset}${left ? ' LH' : ''} shares every edge exactly`, async () => {
          const { thread } = await import('../js/solid.js');
          expect(exactOpen(thread(d, p, l, { offset, left }))).toBe(0);
        });
});

describe('assemblies', () => {
  const plate = {
    id: 's1',
    kind: 'box',
    op: 'add',
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    w: 20,
    d: 20,
    h: 5,
    group: 'g1',
  };
  const hole = {
    id: 's2',
    kind: 'cylinder',
    op: 'subtract',
    pos: [10, 10, -1],
    rot: [0, 0, 0],
    r: 3,
    h: 7,
    group: 'g1',
  };
  const pin = (r) => ({
    id: 's3',
    kind: 'cylinder',
    op: 'add',
    pos: [10, 10, -2],
    rot: [0, 0, 0],
    r,
    h: 9,
    group: 'g2',
  });

  it('holes cut only their own part', async () => {
    const { combineByPart, volume } = await import('../js/solid.js');
    const parts = combineByPart([plate, hole, pin(2.9)]);
    expect(parts.map((p) => p.group)).toEqual(['g1', 'g2']);
    expect(volume(parts[1].mesh)).toBeGreaterThan(Math.PI * 2.8 * 2.8 * 9);
  }, 30_000);

  it('finds no interference when the pin fits and the overlap when it does not', async () => {
    const { combineByPart, interference } = await import('../js/solid.js');
    expect(interference(combineByPart([plate, hole, pin(2.9)]))).toEqual([]);
    const clash = interference(combineByPart([plate, hole, pin(3.5)]));
    expect(clash).toHaveLength(1);
    expect(clash[0].volume).toBeGreaterThan(5);
    expect(clash[0].volume).toBeLessThan(Math.PI * (3.5 * 3.5 - 2.9 * 2.9) * 5 + 10);
  }, 30_000);
});

describe('weld', () => {
  it('makes a CSG result watertight with exactly shared vertices', async () => {
    const { combine, weld, volume } = await import('../js/solid.js');
    const m = combine([
      { id: 'a', kind: 'box', op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], w: 30, d: 30, h: 10 },
      { id: 'b', kind: 'cylinder', op: 'subtract', pos: [15, 15, -1], rot: [0, 0, 0], r: 4, h: 12 },
      { id: 'c', kind: 'box', op: 'add', pos: [10, 10, 10], rot: [0, 0, 0], w: 10, d: 30, h: 5 },
    ]);
    const key = (p) => p.join(',');
    const openOf = (mesh) => {
      const count = new Map();
      for (const { v } of mesh)
        for (let i = 0; i < v.length; i++) {
          const a = key(v[i]);
          const b = key(v[(i + 1) % v.length]);
          const k = a < b ? `${a}|${b}` : `${b}|${a}`;
          count.set(k, (count.get(k) ?? 0) + 1);
        }
      return [...count.values()].filter((c) => c !== 2).length;
    };
    expect(openOf(m)).toBeGreaterThan(0);
    const w = weld(m);
    expect(openOf(w)).toBe(0);
    expect(volume(w)).toBeCloseTo(volume(m), 3);
  }, 30_000);
});
