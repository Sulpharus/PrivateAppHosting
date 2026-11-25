import { describe, expect, it } from 'vitest';
import {
  arcFrom3,
  area,
  bounds,
  dimGeometry,
  hitTest,
  length,
  mirror,
  parseCoordinate,
  rotate,
  snap,
} from '../js/geom.js';

const close = (a, b) => {
  for (const [i, v] of a.entries()) expect(v).toBeCloseTo(b[i], 9);
};

describe('parseCoordinate', () => {
  const last = [10, 10];
  it('reads absolute, relative, polar and length input', () => {
    expect(parseCoordinate('50,20', last)).toEqual([50, 20]);
    expect(parseCoordinate('@5,-2', last)).toEqual([15, 8]);
    close(parseCoordinate('10<90', last), [10, 20]);
    expect(parseCoordinate('12,5;3', last)).toEqual([12.5, 3]);
    expect(parseCoordinate('25', last, [1, 0])).toEqual([35, 10]);
    expect(parseCoordinate('abc', last)).toBeNull();
  });
});

describe('shapes', () => {
  it('measures length and area exactly', () => {
    expect(length({ type: 'rect', a: [0, 0], b: [40, 20] })).toBe(120);
    expect(area({ type: 'rect', a: [0, 0], b: [40, 20] })).toBe(800);
    expect(area({ type: 'circle', c: [0, 0], r: 10 })).toBeCloseTo(Math.PI * 100, 9);
  });

  it('builds an arc through three points', () => {
    const a = arcFrom3([10, 0], [0, 10], [-10, 0]);
    close(a.c, [0, 0]);
    expect(a.r).toBeCloseTo(10, 9);
    expect(a.start).toBeCloseTo(0, 9);
    expect(a.end).toBeCloseTo(Math.PI, 9);
  });

  it('snaps to end points before the grid', () => {
    const e = [{ id: 'l', type: 'line', a: [0, 0], b: [10.3, 0] }];
    expect(snap([10.1, 0.2], e, { tolerance: 1, grid: 5 })).toEqual({ p: [10.3, 0], kind: 'end' });
    expect(snap([7.4, 3], e, { tolerance: 1, grid: 5 }).p).toEqual([5, 5]);
  });

  it('hits the nearest entity', () => {
    const e = [
      { id: 'c', type: 'circle', c: [0, 0], r: 10 },
      { id: 'l', type: 'line', a: [20, 0], b: [30, 0] },
    ];
    expect(hitTest(e, [10.2, 0], 1)?.id).toBe('c');
    expect(hitTest(e, [25, 0.3], 1)?.id).toBe('l');
    expect(hitTest(e, [15, 5], 1)).toBeNull();
  });

  it('rotates and mirrors', () => {
    const r = rotate({ type: 'line', a: [0, 0], b: [10, 0] }, Math.PI / 2, [0, 0]);
    close(r.b, [0, 10]);
    const m = mirror({ type: 'rect', a: [0, 0], b: [10, 5] }, 'y', [20, 0]);
    expect(m.a).toEqual([30, 0]);
    expect(m.b).toEqual([40, 5]);
    const t = rotate({ type: 'rect', a: [0, 0], b: [10, 5] }, Math.PI / 4, [0, 0]);
    expect(t.type).toBe('poly');
  });

  it('dimensions measure the projected distance', () => {
    expect(dimGeometry({ type: 'dim', a: [0, 0], b: [30, 40], kind: 'aligned' }).value).toBeCloseTo(
      50,
      9,
    );
    expect(dimGeometry({ type: 'dim', a: [0, 0], b: [30, 40], kind: 'h' }).value).toBeCloseTo(
      30,
      9,
    );
    expect(dimGeometry({ type: 'dim', a: [0, 0], b: [30, 40], kind: 'v' }).value).toBeCloseTo(
      40,
      9,
    );
  });

  it('bounds cover every shape', () => {
    const b = bounds([
      { type: 'circle', c: [0, 0], r: 5 },
      { type: 'line', a: [10, 10], b: [20, -3] },
    ]);
    expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([-5, -5, 20, 10]);
  });
});
