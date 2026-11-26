import { describe, expect, it } from 'vitest';
import {
  readDxf,
  readGcode,
  readObj,
  readStl,
  writeDxf,
  writeGcode,
  writeObj,
  writeStl,
} from '../js/io.js';
import { box, volume } from '../js/solid.js';

let n = 0;
const newId = () => `id${n++}`;

describe('STL and OBJ', () => {
  it('round-trips a box through binary STL', () => {
    const m = readStl(writeStl(box(10, 10, 10)));
    expect(m.length).toBe(12);
    expect(volume(m)).toBeCloseTo(1000, 3);
  });

  it('reads ASCII STL', () => {
    const t =
      'solid x\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x';
    expect(readStl(new TextEncoder().encode(t).buffer)).toEqual([
      {
        v: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
    ]);
  });

  it('round-trips OBJ', () => {
    expect(volume(readObj(writeObj(box(2, 3, 4))))).toBeCloseTo(24, 6);
  });

  it('rejects garbage', () => {
    expect(() => readStl(new TextEncoder().encode('hello').buffer)).toThrow('invalid');
  });
});

describe('DXF', () => {
  it('round-trips lines, circles, arcs and polylines', () => {
    const src = [
      { id: 'a', type: 'line', a: [0, 0], b: [10, 5] },
      { id: 'b', type: 'circle', c: [5, 5], r: 2.5 },
      { id: 'c', type: 'arc', c: [0, 0], r: 4, start: 0, end: Math.PI / 2 },
      { id: 'd', type: 'rect', a: [0, 0], b: [20, 10] },
    ];
    const { entities } = readDxf(writeDxf(src), newId);
    expect(entities.map((e) => e.type)).toEqual(['line', 'circle', 'arc', 'poly']);
    expect(entities[1].r).toBe(2.5);
    expect(entities[2].end).toBeCloseTo(Math.PI / 2, 6);
    expect(entities[3].pts).toHaveLength(4);
    expect(entities[3].closed).toBe(true);
  });
});

describe('G-code', () => {
  const opts = {
    tool: 3,
    depth: 2,
    step: 1,
    feed: 600,
    plunge: 150,
    safeZ: 5,
    rpm: 12000,
    side: 'outside',
  };

  it('writes passes and reads them back', () => {
    const g = writeGcode([{ id: 'r', type: 'rect', a: [0, 0], b: [20, 10] }], opts);
    expect(g).toContain('G21 G90');
    expect(g.match(/G1 Z-1 /g)).toHaveLength(1);
    expect(g.match(/G1 Z-2 /g)).toHaveLength(1);
    const { cut } = readGcode(g);
    const xs = cut.flat().map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-1.5, 6);
    expect(Math.max(...xs)).toBeCloseTo(21.5, 6);
  });

  it('turns small circles into drill holes', () => {
    expect(writeGcode([{ id: 'c', type: 'circle', c: [5, 5], r: 1 }], opts)).toContain(
      '(Bohrung 2 mm)',
    );
  });

  it('reads inches and arcs', () => {
    const { cut } = readGcode('G20 G90\nG0 X0 Y0\nG1 Z-0.1 F10\nG2 X1 Y0 I0.5 J0');
    const last = cut[0].at(-1);
    expect(last[0]).toBeCloseTo(25.4, 6);
    expect(last[2]).toBeCloseTo(-2.54, 6);
  });
});
