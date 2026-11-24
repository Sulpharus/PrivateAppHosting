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
  db: {
    from(name: string): PromiseLike<{ data: Row[] }> & {
      gt(c: string, v: number): PromiseLike<{ data: Row[] }>;
      insert(row: Row): Promise<{ error: { code: string } | null }>;
    };
  };
  ai: { chat(prompt: string): Promise<string>; json(p: string, s: object): Promise<unknown> };
  api(id: string): { json(path: string): Promise<unknown> };
  config: { portalUrl: string; preview: boolean };
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
    expect(mn?.config.preview).toBe(true);
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
    expect((await mn.db.from('recipes').gt('n', 20)).data.map((r) => r.title)).toEqual(['Suppe']);
    await recipes.remove(id);
    expect(await recipes.list()).toHaveLength(1);
  });

  it('refuses a second row with the same id on insert, like a unique key', async () => {
    const mn = (await load()?.mininode()) as Client;
    expect((await mn.db.from('moves').insert({ id: 'a' })).error).toBeNull();
    expect((await mn.db.from('moves').insert({ id: 'a' })).error?.code).toBe('23505');
  });

  it('answers AI with a placeholder and reports external APIs as not set up', async () => {
    const mn = (await load()?.mininode()) as Client;
    expect(await mn.ai.chat('Hallo')).toContain('Vorschau');
    await expect(mn.ai.json('x', {})).rejects.toMatchObject({ code: 'preview_only' });
    await expect(mn.api('weather').json('/x')).rejects.toMatchObject({ keyMissing: true });
  });
});
