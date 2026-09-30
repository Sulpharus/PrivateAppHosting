import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MininodeConfig } from './config.ts';
import { createGame, PING_MS } from './game.ts';

const config = {
  appSlug: 'memory',
  portalUrl: 'https://mininode.app',
} as MininodeConfig;

function fakeSupabase(fail = false) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  let n = 0;
  const supabase = {
    schema: () => ({
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        calls.push({ fn, ...(args ? { args } : {}) });
        if (fail) return { data: null, error: new Error('offline') };
        return { data: fn === 'game_session_start' ? `s${++n}` : 30, error: null };
      },
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe('mn.game.track', () => {
  let state: DocumentVisibilityState = 'visible';
  const listeners = new Set<() => void>();
  beforeEach(() => {
    vi.useFakeTimers();
    state = 'visible';
    vi.stubGlobal('document', {
      get visibilityState() {
        return state;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    listeners.clear();
  });
  const setVisibility = (next: DocumentVisibilityState) => {
    state = next;
    for (const fn of listeners) fn();
  };

  it('pings while visible and starts a new session after a pause', async () => {
    const { supabase, calls } = fakeSupabase();
    const stop = createGame(config, supabase).track();
    await vi.advanceTimersByTimeAsync(PING_MS * 2);
    expect(calls.map((c) => c.fn)).toEqual([
      'game_session_start',
      'game_session_ping',
      'game_session_ping',
    ]);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(PING_MS * 10);
    // One last ping when hidden, then nothing while away.
    expect(calls.filter((c) => c.fn === 'game_session_ping')).toHaveLength(3);

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(PING_MS);
    expect(calls.at(-2)).toEqual({ fn: 'game_session_start' });
    expect(calls.at(-1)).toEqual({ fn: 'game_session_ping', args: { p_session: 's2' } });

    stop();
    const count = calls.length;
    await vi.advanceTimersByTimeAsync(PING_MS * 3);
    setVisibility('visible');
    expect(calls.length).toBe(count + 1); // the final ping from stop()
    expect(listeners.size).toBe(0);
  });

  it('keeps the game running when reports fail', async () => {
    const { supabase, calls } = fakeSupabase(true);
    const stop = createGame(config, supabase).track();
    await vi.advanceTimersByTimeAsync(PING_MS * 2);
    expect(calls.map((c) => c.fn)).toEqual(['game_session_start']);
    stop();
  });
});

describe('mn.game', () => {
  it('reports results and links to the hub', async () => {
    const { supabase, calls } = fakeSupabase();
    const game = createGame(config, supabase);
    await game.result('win', { moves: 24 }, 95.4);
    expect(calls[0]).toEqual({
      fn: 'game_result',
      args: { p_outcome: 'win', p_stats: { moves: 24 }, p_seconds: 95 },
    });
    expect(game.hubUrl()).toBe('https://mininode.app/games/memory');
  });
});
