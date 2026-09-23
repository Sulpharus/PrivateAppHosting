// Integration fixtures (see fixtures/README.md): raw exports must fail doctor with the listed
// rules, integrated versions must pass without findings.
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctor } from './doctor.ts';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');

const cases: { name: string; slug: string; expectedRules: string[] }[] = [
  { name: 'static-html', slug: 'hallo', expectedRules: ['no-cdn-scripts', 'sdk-required'] },
  {
    name: 'claude-artifact',
    slug: 'notizen',
    expectedRules: ['no-artifact-runtime', 'sdk-required', 'build'],
  },
  {
    name: 'ai-studio',
    slug: 'rezeptideen',
    expectedRules: ['no-client-ai-keys', 'no-client-ai-sdk', 'no-cdn-scripts', 'sdk-required'],
  },
];

describe.each(cases)('fixture $name', ({ name, slug, expectedRules }) => {
  it('raw export fails doctor for the right reasons', () => {
    const rules = doctor(join(FIXTURES, name, 'input')).findings.map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(expectedRules));
  });

  it('integrated app passes doctor cleanly', () => {
    expect(doctor(join(FIXTURES, name, 'expected', slug)).findings).toEqual([]);
  });
});
