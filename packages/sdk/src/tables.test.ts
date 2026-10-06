import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { isRefusal } from './offline.ts';
import { createTableRemote } from './tables.ts';

type Call = { op: string; table: string; args: unknown[] };
type Result = { data: unknown; error: { message: string; code?: string } | null; status: number };

/** A supabase client whose query builder records the calls and answers with `reply`. */
function fakeClient(reply: (call: Call) => Result) {
  const calls: Call[] = [];
  const supabase = {
    schema: (schema: string) => ({
      from: (table: string) => {
        const call: Call = { op: 'select', table, args: [schema] };
        calls.push(call);
        const done = () => Promise.resolve(reply(call));
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (...args: unknown[]) => {
            call.args.push('eq', ...args);
            // `delete().eq()` ends the chain and is awaited
            return call.op === 'delete' ? done() : chain;
          },
          order: () => chain,
          range: (...args: unknown[]) => {
            call.args.push('range', ...args);
            return done();
          },
          maybeSingle: done,
          upsert: (row: unknown, options: unknown) => {
            call.op = 'upsert';
            call.args.push(row, options);
            return done();
          },
          delete: () => {
            call.op = 'delete';
            return chain;
          },
        };
        return chain;
      },
    }),
  };
  return { calls, supabase: supabase as unknown as SupabaseClient };
}

const ok = (data: unknown = null): Result => ({ data, error: null, status: 200 });

describe('table remote', () => {
  it('upserts without the columns the database fills, with null for undefined', async () => {
    const { calls, supabase } = fakeClient(() => ok());
    const remote = createTableRemote(supabase, 'rezepte');
    await remote.set('recipes/a', {
      title: 'Suppe',
      note: undefined,
      owner_id: 'u',
      created_at: 'x',
      updated_at: 'y',
    } as never);
    expect(calls[0]?.op).toBe('upsert');
    expect(calls[0]?.args[0]).toBe('app_rezepte');
    expect(calls[0]?.args[1]).toEqual({ id: 'a', title: 'Suppe', note: null });
    expect(calls[0]?.args[2]).toEqual({ onConflict: 'id' });
  });

  it('uses the conflict key of the table', async () => {
    const { calls, supabase } = fakeClient(() => ok());
    const remote = createTableRemote(supabase, 'rezepte', new Map([['recipes', 'owner_id,id']]));
    await remote.set('recipes/a', { title: 'x' });
    await remote.set('other/b', { title: 'y' });
    expect(calls[0]?.args[2]).toEqual({ onConflict: 'owner_id,id' });
    expect(calls[1]?.args[2]).toEqual({ onConflict: 'id' });
  });

  it('pages through more rows than one response holds', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i).padStart(5, '0') }));
    const { calls, supabase } = fakeClient((call) => {
      const at = call.args.indexOf('range');
      const from = call.args[at + 1] as number;
      const to = call.args[at + 2] as number;
      return ok(rows.slice(from, to + 1));
    });
    const list = await createTableRemote(supabase, 'rezepte').list('recipes/');
    expect(list).toHaveLength(2500);
    expect(list[0]?.key).toBe('recipes/00000');
    expect(calls).toHaveLength(3);
  });

  it('reads and deletes one row by id', async () => {
    const { calls, supabase } = fakeClient((call) =>
      call.op === 'delete' ? ok() : ok({ id: 'a', title: 'Suppe' }),
    );
    const remote = createTableRemote(supabase, 'rezepte');
    expect(await remote.get('recipes/a')).toEqual({ id: 'a', title: 'Suppe' });
    await remote.delete('recipes/a');
    expect(calls.map((call) => call.op)).toEqual(['select', 'delete']);
    expect(calls[1]?.args).toContain('a');
  });

  it('refuses keys and names that are no table', async () => {
    const { supabase } = fakeClient(() => ok());
    const remote = createTableRemote(supabase, 'rezepte');
    await expect(remote.get('Recipes/a')).rejects.toThrow(/bad table key/);
    await expect(remote.get('recipes')).rejects.toThrow(/bad table key/);
    await expect(remote.list('a b/')).rejects.toThrow(/bad table name/);
  });

  it('turns a PostgREST error into a refusal the queue can recognise', async () => {
    const { supabase } = fakeClient(() => ({
      data: null,
      error: { message: 'new row violates row-level security policy', code: '42501' },
      status: 403,
    }));
    const remote = createTableRemote(supabase, 'rezepte');
    const err = await remote.set('recipes/a', { title: 'x' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status: number }).status).toBe(403);
    expect(isRefusal(err)).toBe(true);
  });
});
