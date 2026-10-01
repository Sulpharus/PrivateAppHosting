import { describe, expect, it } from 'vitest';
import type { IntegrateResult } from './integrate/types.ts';
import { submissionPatch } from './submissions.ts';

const result: IntegrateResult = {
  status: 'needs_review',
  framework: 'vite',
  slug: 'sentinel',
  name: 'Sentinel',
  reasons: [{ code: 'own_backend', message: 'x' }],
  warnings: ['w'],
  actions: ['a'],
  outDir: null,
};

describe('submissionPatch', () => {
  it('carries the summary, the log and the links', () => {
    const patch = submissionPatch('needs_review', result, 'Bericht', {
      review: 'https://github.com/o/r/issues/1',
    });
    expect(patch).toMatchObject({
      status: 'needs_review',
      slug: 'sentinel',
      log: 'Bericht',
      review_url: 'https://github.com/o/r/issues/1',
      summary: { framework: 'vite', reasons: [{ code: 'own_backend' }] },
    });
    expect(patch).not.toHaveProperty('pr_url');
  });

  it('keeps the log within the column limit and leaves unknowns out', () => {
    const patch = submissionPatch('integrating', null, 'x'.repeat(30_000));
    expect((patch.log as string).length).toBe(20_000);
    expect(patch).not.toHaveProperty('summary');
    expect(patch).not.toHaveProperty('slug');
  });
});
