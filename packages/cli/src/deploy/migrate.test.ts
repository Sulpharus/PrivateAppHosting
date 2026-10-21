import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appSchemasWithTables, exposeSchemas } from './migrate.ts';

describe('appSchemasWithTables', () => {
  it('names the schema of every app with SQL migrations, hyphens as underscores', () => {
    const root = mkdtempSync(join(tmpdir(), 'mn-expose-'));
    const app = (slug: string, files: Record<string, string>) => {
      mkdirSync(join(root, slug, 'db'), { recursive: true });
      for (const [name, sql] of Object.entries(files))
        writeFileSync(join(root, slug, 'db', name), sql);
      return join(root, slug);
    };
    const dirs = [
      app('sportplaner', { '001_init.sql': 'select 1;' }),
      app('haushalts-inventar', { '001_init.sql': 'select 1;' }),
      app('empty-db', { 'notes.txt': '' }),
    ];
    mkdirSync(join(root, 'static-app'));
    dirs.push(join(root, 'static-app'));
    expect(appSchemasWithTables(dirs)).toEqual(['app_sportplaner', 'app_haushalts_inventar']);
  });
});

describe('exposeSchemas', () => {
  const options = { projectRef: 'ref', accessToken: 'tok', schemas: ['app_a'], retryMs: 0 };

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

  it('tries a failed read again before it gives up', async () => {
    let calls = 0;
    const f = fake(() =>
      ++calls < 3
        ? new Response('busy', { status: 500 })
        : Response.json({ db_schema: 'public,platform,app_b' }),
    );
    expect(await exposeSchemas({ ...options, fetcher: f.fetcher })).toEqual(['app_a']);
    expect(f.patched()).toBe('public,platform,app_b,app_a');
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
