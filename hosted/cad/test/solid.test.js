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
