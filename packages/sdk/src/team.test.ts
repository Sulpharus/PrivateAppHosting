import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createTeams } from './team.ts';

function fake(reply: (fn: string, args: Record<string, unknown>) => unknown) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const supabase = {
    schema: (schema: string) => ({
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn: `${schema}.${fn}`, args });
        const data = reply(fn, args);
        return data instanceof Error ? { data: null, error: data } : { data, error: null };
      },
    }),
  };
  return { calls, teams: createTeams(supabase as unknown as SupabaseClient, 'projekte') };
}

describe('mn.team', () => {
  it("lists the teams of this app with the caller's role", async () => {
    const { calls, teams } = fake(() => [
      { id: 't1', name: 'Band', role: 'owner', member_count: 3 },
    ]);
    expect(await teams.list()).toEqual([{ id: 't1', name: 'Band', role: 'owner', memberCount: 3 }]);
    expect(calls[0]).toEqual({ fn: 'platform.team_list', args: { p_slug: 'projekte' } });
  });

  it('creates a team and manages its people through the platform functions', async () => {
    const { calls, teams } = fake((fn) => (fn === 'team_create' ? 'new-id' : null));
    expect(await teams.create('Band')).toBe('new-id');
    await teams.setMember('t1', 'u2', 'editor');
    await teams.removeMember('t1', 'u2');
    await teams.notify('t1', 'u2', 'Aufgabe', undefined, '/card/1');
    expect(calls.map((call) => call.fn)).toEqual([
      'platform.team_create',
      'platform.team_set_member',
      'platform.team_remove_member',
      'platform.team_notify',
    ]);
    expect(calls[3]?.args).toMatchObject({ p_body: null, p_url: '/card/1' });
  });

  it('lists the members by name', async () => {
    const { teams } = fake(() => [{ user_id: 'u1', display_name: 'Anna', role: 'owner' }]);
    expect(await teams.members('t1')).toEqual([{ id: 'u1', name: 'Anna', role: 'owner' }]);
  });

  it('throws what the database refuses', async () => {
    const { teams } = fake(() => Object.assign(new Error('not allowed'), { code: '42501' }));
    await expect(teams.rename('t1', 'x')).rejects.toThrow('not allowed');
  });
});
