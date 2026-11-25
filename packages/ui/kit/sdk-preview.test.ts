// The preview SDK of the starter package (sdk-preview.js): same surface as the real client, data in
// this browser, and it never replaces a real SDK that is already loaded.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

interface Row {
  id: string;
  title?: string;
  n?: number;
  owner_id?: string;
}
interface Client {
  auth: { requireLogin(): Promise<{ id: string }>; role(): Promise<string> };
  kv: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    list(prefix: string): Promise<{ key: string; value: unknown }[]>;
  };
  table(name: string): {
    newId(): string;
    list(): Promise<Row[]>;
    get(id: string): Promise<Row | null>;
    upsert(row: Row): Promise<Row>;
    remove(id: string): Promise<void>;
  };
  db: { from(name: string): Query };
  ai: { chat(prompt: string): Promise<string>; json(p: string, s: object): Promise<unknown> };
  api(id: string): { json(path: string): Promise<unknown> };
  config: { portalUrl: string };
  team: { create(name: string): Promise<string>; members(id: string): Promise<{ id: string }[]> };
  suite: {
    type(t: string): { upsert(f: object): Promise<{ record: { id: string }; merged: boolean }> };
    createCollection(name: string, family: string): Promise<string>;
  };
  files: { upload(p: string, b: Blob): Promise<string>; list(prefix?: string): Promise<string[]> };
}
type Result = { data: unknown; error: { code?: string; message: string } | null };
interface Query extends PromiseLike<Result> {
  select(columns?: string): Query;
  insert(row: Row | Row[]): Query;
  update(values: Partial<Row>): Query;
  delete(): Query;
  eq(c: string, v: unknown): Query;
  gt(c: string, v: number): Query;
  order(c: string, o?: { ascending: boolean }): Query;
  single(): Query;
  textSearch(c: string, q: string): Query;
}
type Global = { mininode?: { mininode(): Promise<Client>; preview?: boolean } };

const source = readFileSync(join(import.meta.dirname, 'sdk-preview.js'), 'utf8');
const load = () => {
  new Function(source)();
  return (window as unknown as Global).mininode;
};

describe('preview SDK', () => {
  beforeEach(() => {
    delete (window as unknown as Global).mininode;
    window.localStorage.clear();
    document.body.innerHTML = '';
  });

  it('never replaces a real SDK', () => {
    const real = { mininode: async () => ({}) as Client };
    (window as unknown as Global).mininode = real;
    new Function(source)();
    expect((window as unknown as Global).mininode).toBe(real);
  });

  it('signs in a sample person and shows that it is a preview', async () => {
    const mn = await load()?.mininode();
    const user = await mn?.auth.requireLogin();
    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await mn?.auth.role()).toBe('admin');
    expect(document.body.textContent).toContain('Vorschau ohne MiniNode');
  });

  it('keeps kv values and table rows in this browser', async () => {
    const mn = (await load()?.mininode()) as Client;
    await mn.kv.set('settings', { theme: 'dark' });
    expect(await mn.kv.get('settings')).toEqual({ theme: 'dark' });
    expect((await mn.kv.list('sett')).map((e) => e.key)).toEqual(['settings']);

    const recipes = mn.table('recipes');
    const id = recipes.newId();
    await recipes.upsert({ id, title: 'Suppe', n: 30 });
    await recipes.upsert({ id: recipes.newId(), title: 'Brot', n: 10 });
    expect((await recipes.get(id))?.owner_id).toBeTruthy();
    expect(
      ((await mn.db.from('recipes').select('*').gt('n', 20)).data as Row[]).map((r) => r.title),
    ).toEqual(['Suppe']);
    await recipes.remove(id);
    expect(await recipes.list()).toHaveLength(1);
  });

  it('chains writes like supabase-js and refuses a duplicate key on insert', async () => {
    const mn = (await load()?.mininode()) as Client;
    const inserted = await mn.db.from('moves').insert({ id: 'a', n: 1 }).select().single();
    expect(inserted).toMatchObject({ data: { id: 'a', n: 1 }, error: null });
    expect((await mn.db.from('moves').insert({ id: 'a' })).error?.code).toBe('23505');
    await mn.db.from('moves').update({ n: 2 }).eq('id', 'a');
    expect((await mn.db.from('moves').select().eq('id', 'a').single()).data).toMatchObject({
      n: 2,
    });
    await mn.db.from('moves').delete().eq('id', 'a');
    expect((await mn.db.from('moves').select()).data).toEqual([]);
    // A method the preview does not know answers with an error instead of throwing.
    expect((await mn.db.from('moves').select().textSearch('t', 'x')).error?.message).toMatch(
      /preview/,
    );
  });

  it('returns what the real client returns for teams, suite records and files', async () => {
    const mn = (await load()?.mininode()) as Client;
    expect(typeof (await mn.team.create('Urlaub'))).toBe('string');
    expect((await mn.team.members('x'))[0]).toHaveProperty('id');
    const write = await mn.suite.type('event').upsert({ title: 'x' });
    expect(write).toMatchObject({ merged: false, record: { title: 'x' } });
    expect(typeof (await mn.suite.createCollection('Familie', 'calendar'))).toBe('string');
    await mn.files.upload('fotos/a/1.jpg', new Blob(['x']));
    await mn.files.upload('fotos/b.jpg', new Blob(['y']));
    expect((await mn.files.list('fotos')).sort()).toEqual(['a', 'b.jpg']);
  });

  it('carries the marker that integrate and doctor look for', () => {
    expect(source.split('\n')[0]).toContain('mininode-preview-sdk');
  });

  it('answers AI with a placeholder and reports external APIs as not set up', async () => {
    const mn = (await load()?.mininode()) as Client;
    expect(await mn.ai.chat('Hallo')).toContain('Vorschau');
    await expect(mn.ai.json('x', {})).rejects.toMatchObject({ code: 'preview_only' });
    await expect(mn.api('weather').json('/x')).rejects.toMatchObject({ keyMissing: true });
  });
});
