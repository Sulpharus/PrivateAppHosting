import { describe, expect, it } from 'vitest';
import { chainLines, generateViews, viewLines } from '../js/projection.js';
import { box, combine } from '../js/solid.js';

let n = 0;
const newId = () => `v${n++}`;

describe('chainLines', () => {
  it('joins a square of four pieces into one closed polyline', () => {
    const sq = [
      { a: [0, 0], b: [5, 0], hidden: false },
      { a: [5, 0], b: [10, 0], hidden: false },
      { a: [10, 0], b: [10, 10], hidden: false },
      { a: [10, 10], b: [0, 10], hidden: false },
      { a: [0, 10], b: [0, 0], hidden: false },
    ];
    const c = chainLines(sq);
    expect(c).toHaveLength(1);
    expect(c[0].closed).toBe(true);
    expect(c[0].pts).toHaveLength(4);
  });
});

describe('views', () => {
  it('a box seen from the front is a rectangle of four visible edges', () => {
    const lines = viewLines(box(40, 20, 10), 'front');
    const visible = lines.filter((l) => !l.hidden);
    expect(visible).toHaveLength(4);
    const xs = visible.flatMap((l) => [l.a[0], l.b[0]]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(40, 6);
  });

  it('a through hole shows as hidden lines in the front view and a circle on top', () => {
    const m = combine([
      { id: 'p', kind: 'box', op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], w: 40, d: 30, h: 10 },
      { id: 'h', kind: 'cylinder', op: 'subtract', pos: [20, 15, -1], rot: [0, 0, 0], r: 5, h: 12 },
    ]);
    const front = viewLines(m, 'front');
    expect(front.some((l) => l.hidden)).toBe(true);
    const top = viewLines(m, 'top');
    expect(top.filter((l) => !l.hidden).length).toBeGreaterThan(20);
  });

  it('places views and adds dimensions', () => {
    const out = generateViews(box(40, 20, 10), { newId, views: ['front', 'top', 'left'] });
    const dims = out.filter((e) => e.type === 'dim');
    expect(dims).toHaveLength(3);
    const top = out.filter((e) => e.view === 'top' && e.type !== 'dim');
    expect(Math.max(...top.flatMap((l) => (l.pts ?? [l.a, l.b]).map((p) => p[1])))).toBeLessThan(0);
    const left = out.filter((e) => e.view === 'left' && e.type !== 'dim');
    expect(
      Math.min(...left.flatMap((l) => (l.pts ?? [l.a, l.b]).map((p) => p[0]))),
    ).toBeGreaterThan(40);
  });
});
