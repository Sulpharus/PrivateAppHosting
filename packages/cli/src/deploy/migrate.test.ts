import { describe, expect, it } from 'vitest';
import { exposeSchemas } from './migrate.ts';

describe('exposeSchemas', () => {
  const options = { projectRef: 'ref', accessToken: 'tok', schemas: ['app_a'] };

  function fake(answer: () => Response) {
    let patched: string | undefined;
    const fetcher = (async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patched = (JSON.parse(String(init.body)) as { db_schema: string }).db_schema;
        return new Response('{}', { status: 200 });
      }
      return answer();
    }) as unknown as typeof fetch;
    return { fetcher, patched: () => patched };
  }

  it('adds the schema and keeps every other app schema', async () => {
    const f = fake(() => Response.json({ db_schema: 'public, graphql_public,platform,app_b' }));
    expect(await exposeSchemas({ ...options, fetcher: f.fetcher })).toEqual(['app_a']);
    expect(f.patched()).toBe('public,graphql_public,platform,app_b,app_a');
  });

  it('writes nothing when the schema is exposed already', async () => {
    const f = fake(() => Response.json({ db_schema: 'public,platform,app_a' }));
    expect(await exposeSchemas({ ...options, fetcher: f.fetcher })).toEqual([]);
    expect(f.patched()).toBeUndefined();
  });

  it('never replaces the list when it could not be read', async () => {
    // A guessed list would hide every other app (Sportplaner, Haushalt, … without their tables).
    for (const answer of [
      () => new Response('rate limited', { status: 429 }),
      () => Response.json({ message: 'no db_schema here' }),
    ]) {
      const f = fake(answer);
      await expect(exposeSchemas({ ...options, fetcher: f.fetcher })).rejects.toThrow(
        /reading the exposed schemas failed/,
      );
      expect(f.patched()).toBeUndefined();
    }
  });
});
