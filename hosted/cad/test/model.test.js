import { describe, expect, it } from 'vitest';
import {
  applyOps,
  describe as describeModel,
  emptyModel,
  fieldsOf,
  normalise,
} from '../js/model.js';

describe('applyOps', () => {
  it('adds shapes and solids with readable ids', () => {
    const { model, added, errors } = applyOps(emptyModel(), [
      { op: 'add_rect', x: 0, y: 0, w: 80, h: 40 },
      { op: 'add_circle', cx: 20, cy: 20, r: 4 },
      { op: 'add_box', x: 0, y: 0, z: 0, w: 80, d: 40, h: 5 },
      { op: 'add_cylinder', x: 20, y: 20, z: -1, r: 4, h: 7, mode: 'subtract' },
    ]);
    expect(errors).toEqual([]);
    expect(added).toEqual(['e1', 'e2', 's3', 's4']);
    expect(model.solids[1].op).toBe('subtract');
  });

  it('skips invalid operations and keeps the rest', () => {
    const { model, errors } = applyOps(emptyModel(), [
      { op: 'add_circle', cx: 0, cy: 0, r: -2 },
      { op: 'add_line', x1: 0, y1: 0, x2: 10, y2: 0 },
      { op: 'delete', target: 'nope' },
      { op: 'launch_rocket' },
      { op: 'add_box', x: 0, y: 0, z: 0, w: 1e9, d: 1, h: 1 },
    ]);
    expect(model.sketch.entities).toHaveLength(1);
    expect(errors.map((e) => e.code)).toEqual([
      'invalid_value',
      'unknown_target',
      'unknown_op',
      'missing_value',
    ]);
  });

  it('sets exact values, moves, duplicates and extrudes', () => {
    let { model } = applyOps(emptyModel(), [{ op: 'add_rect', x: 0, y: 0, w: 10, h: 10 }]);
    ({ model } = applyOps(model, [
      { op: 'set', target: 'e1', w: 25.4 },
      { op: 'move', target: 'e1', dx: 5, dy: 0 },
      { op: 'duplicate', target: 'e1', dx: 0, dy: 20 },
      { op: 'extrude', target: 'e1', h: 3 },
    ]));
    expect(fieldsOf(model.sketch.entities[0])).toEqual({ x: 5, y: 0, w: 25.4, h: 10 });
    expect(model.sketch.entities[1].a).toEqual([5, 20]);
    expect(model.solids[0].kind).toBe('extrude');
    expect(model.solids[0].profile).toHaveLength(4);
  });

  it('generates views from the solids', () => {
    let { model } = applyOps(emptyModel(), [
      { op: 'add_box', x: 0, y: 0, z: 0, w: 30, d: 20, h: 10 },
    ]);
    ({ model } = applyOps(model, [{ op: 'generate_views', views: ['front', 'top'] }]));
    expect(model.sketch.entities.filter((e) => e.gen === 'views').length).toBeGreaterThan(6);
    // Generated again: replaced, not doubled.
    const count = model.sketch.entities.length;
    ({ model } = applyOps(model, [{ op: 'generate_views', views: ['front', 'top'] }]));
    expect(model.sketch.entities.length).toBe(count);
    expect(describeModel(model).generatedViewLines).toBeGreaterThan(0);
  });

  it('normalise keeps ids unique after loading', () => {
    const m = normalise({
      sketch: { entities: [{ id: 'e7', type: 'line', a: [0, 0], b: [1, 1] }] },
    });
    expect(m.seq).toBe(7);
    expect(applyOps(m, [{ op: 'add_line', x1: 0, y1: 0, x2: 1, y2: 0 }]).added).toEqual(['e8']);
  });
});

describe('normalise keeps what it can', () => {
  it('drops an unknown material but keeps the solid', () => {
    const m = normalise({
      solids: [
        {
          id: 's1',
          name: 'A',
          kind: 'box',
          op: 'add',
          pos: [0, 0, 0],
          rot: [0, 0, 0],
          w: 1,
          d: 1,
          h: 1,
          material: { id: 'unobtainium' },
        },
      ],
    });
    expect(m.solids).toHaveLength(1);
    expect(m.solids[0].material).toBeUndefined();
  });

  it('drops a thread with bad values or one too fine to build', () => {
    const base = {
      name: 'T',
      kind: 'thread',
      op: 'add',
      pos: [0, 0, 0],
      rot: [0, 0, 0],
      d: 6,
      pitch: 1,
      h: 10,
    };
    const m = normalise({
      solids: [
        { ...base, id: 's1', clearance: 'x' },
        { ...base, id: 's2', pitch: 0.01 },
        { ...base, id: 's3', h: 5000 },
        { ...base, id: 's4', clearance: 0.1 },
      ],
    });
    expect(m.solids.map((s) => s.id)).toEqual(['s4']);
  });

  it('refuses an add_thread that would be too complex', () => {
    const { errors } = applyOps(emptyModel(), [
      { op: 'add_thread', x: 0, y: 0, z: 0, d: 6, pitch: 1, h: 4000 },
    ]);
    expect(errors[0].code).toBe('too_complex');
  });
});

describe('parts of an assembly', () => {
  const base = () =>
    applyOps(emptyModel(), [
      { op: 'add_box', x: 0, y: 0, z: 0, w: 20, d: 10, h: 4 },
      { op: 'add_cylinder', x: 5, y: 5, z: -1, r: 2, h: 6, mode: 'subtract' },
      { op: 'add_cylinder', x: 50, y: 0, z: 0, r: 1.8, h: 12 },
    ]).model;

  it('groups solids, moves and turns a part as a whole', () => {
    let { model, added } = applyOps(base(), [
      { op: 'make_group', targets: ['s1', 's2'], name: 'Halter' },
    ]);
    const g = added[0];
    expect(g).toMatch(/^g\d+$/);
    expect(model.solids.filter((x) => x.group === g)).toHaveLength(2);
    ({ model } = applyOps(model, [{ op: 'move_group', target: g, dx: 10, dz: 2 }]));
    expect(model.solids[0].pos).toEqual([10, 0, 2]);
    expect(model.solids[1].pos).toEqual([15, 5, 1]);
    ({ model } = applyOps(model, [{ op: 'rotate_group', target: g, angle: 90 }]));
    // Centre of the part's box: (20, 5); the box corner (10, 0) turns to (25, -5).
    expect(model.solids[0].pos[0]).toBeCloseTo(25, 6);
    expect(model.solids[0].pos[1]).toBeCloseTo(-5, 6);
    expect(model.solids[0].rot[2]).toBe(90);
  });

  it('colours, hides, ungroups and deletes a part', () => {
    let { model, added } = applyOps(base(), [{ op: 'make_group', targets: ['s1', 's2'] }]);
    const g = added[0];
    ({ model } = applyOps(model, [
      { op: 'set_group', target: g, material: { id: 'brass' }, hidden: true },
    ]));
    expect(model.solids[0].material).toEqual({ id: 'brass' });
    expect(model.solids[1].material).toBeUndefined(); // holes have no material of their own
    expect(model.solids[0].hidden).toBe(true);
    const un = applyOps(model, [{ op: 'ungroup', target: g }]).model;
    expect(un.groups).toEqual([]);
    expect(un.solids.every((x) => !x.group)).toBe(true);
    const del = applyOps(model, [{ op: 'delete_group', target: g }]).model;
    expect(del.solids.map((x) => x.id)).toEqual(['s3']);
  });

  it('normalise drops references to parts that do not exist', () => {
    const m = normalise({
      groups: [{ id: 'g9', name: 'A' }],
      solids: [
        {
          id: 's1',
          name: 'x',
          kind: 'box',
          op: 'add',
          pos: [0, 0, 0],
          rot: [0, 0, 0],
          w: 1,
          d: 1,
          h: 1,
          group: 'g9',
        },
        {
          id: 's2',
          name: 'y',
          kind: 'box',
          op: 'add',
          pos: [0, 0, 0],
          rot: [0, 0, 0],
          w: 1,
          d: 1,
          h: 1,
          group: 'g4',
        },
      ],
    });
    expect(m.solids.map((x) => x.group)).toEqual(['g9', undefined]);
    expect(m.seq).toBe(9);
  });
});

describe('parts stay consistent', () => {
  it('a solid added into a part is cut by its holes, and empty parts disappear', async () => {
    const { combine, volume } = await import('../js/solid.js');
    let { model, added } = applyOps(emptyModel(), [
      { op: 'add_box', x: 0, y: 0, z: 0, w: 20, d: 20, h: 5 },
    ]);
    ({ model, added } = applyOps(model, [
      { op: 'make_group', targets: [added[0]], name: 'Import' },
    ]));
    const g = added[0];
    ({ model } = applyOps(model, [
      { op: 'add_cylinder', x: 10, y: 10, z: -1, r: 3, h: 7, mode: 'subtract', group: g },
    ]));
    expect(model.solids[1].group).toBe(g);
    expect(volume(combine(model.solids))).toBeLessThan(20 * 20 * 5 - 100);
    // Moving the hole out of the part: it no longer cuts.
    ({ model } = applyOps(model, [{ op: 'set', target: model.solids[1].id, group: '' }]));
    expect(volume(combine(model.solids))).toBeCloseTo(2000, 3);
    // Deleting the last solid of a part removes the part.
    ({ model } = applyOps(model, [{ op: 'delete', target: model.solids[0].id }]));
    expect(model.groups).toEqual([]);
  });
});
