import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { appsSinceDeployed, readDeployedVersions } from './deployed.ts';

const clientWith = (result: {
  data: { slug: string; deployed_version: string | null }[] | null;
  error: { message: string } | null;
}) =>
  ({
    schema: () => ({ from: () => ({ select: async () => result }) }),
  }) as unknown as SupabaseClient;

describe('readDeployedVersions', () => {
  it('maps each slug to its version, a missing version to null', async () => {
    const client = clientWith({
      data: [
        { slug: 'a', deployed_version: 'abc1234' },
        { slug: 'b', deployed_version: null },
      ],
      error: null,
    });
    expect(await readDeployedVersions('staging', client)).toEqual(
      new Map([
        ['a', 'abc1234'],
        ['b', null],
      ]),
    );
  });

  it('fails when the registry cannot be read', async () => {
    const client = clientWith({ data: null, error: { message: 'boom' } });
    await expect(readDeployedVersions('staging', client)).rejects.toThrow(/boom/);
  });
});

describe('appsSinceDeployed', () => {
  const pick = (slugs: string[], deployed: Map<string, string | null>) =>
    slugs.filter((slug) => deployed.get(slug) !== 'same');

  it('selects from the registry versions', async () => {
    const lines: string[] = [];
    const result = await appsSinceDeployed(
      ['a', 'b'],
      async () =>
        new Map([
          ['a', 'same'],
          ['b', 'old'],
        ]),
      pick,
      (line) => lines.push(line),
    );
    expect(result).toEqual(['b']);
    expect(lines).toEqual([]);
  });

  it('deploys every app, with a warning, when the registry cannot be read', async () => {
    const lines: string[] = [];
    const result = await appsSinceDeployed(
      ['a', 'b'],
      async () => {
        throw new Error('registry down');
      },
      pick,
      (line) => lines.push(line),
    );
    expect(result).toEqual(['a', 'b']);
    expect(lines[0]).toMatch(/registry down.*every app/);
  });
});
