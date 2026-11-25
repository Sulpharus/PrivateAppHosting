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
