import type { SupabaseClient } from '@supabase/supabase-js';
import type { MininodeConfig } from './config.ts';

// Games and the Gaming Hub (ADR 0009). An app with a `game` block in mininode.json reports
// playtime and finished rounds; the player's one username comes from the hub. The platform takes
// the game from the page's origin, so a game can only report for itself.

export type GameOutcome = 'win' | 'loss' | 'draw' | 'done';

export interface GameStats {
  seconds: number;
  sessions: number;
  results: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayed: string | null;
  /** Best value per declared stat (`better` decides: highest or lowest). */
  records: Record<string, number>;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  value: number;
  mine: boolean;
}

/** How often a running game reports; the platform counts at most 90 s per report. */
export const PING_MS = 30_000;

interface Timers {
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

export function createGame(
  config: MininodeConfig,
  supabase: SupabaseClient,
  timers: Timers = globalThis,
) {
  const rpc = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.schema('platform').rpc(fn, args);
    if (error) throw error;
    return data as T;
  };

  return {
    /** The player's username for all games, or null when none is set yet. */
    async username(): Promise<string | null> {
      const rows = await rpc<{ username: string }[]>('game_profile');
      return rows?.[0]?.username ?? null;
    },

    /** The Gaming Hub page of this game; the player picks the username there (portal only). */
    hubUrl(): string {
      return new URL(`/games/${encodeURIComponent(config.appSlug)}`, config.portalUrl).toString();
    },

    /**
     * Counts playtime while the game is visible. Call once when play starts; the returned
     * function stops counting (e.g. on the menu screen). Hidden tabs do not count, and failed
     * reports (offline) are skipped without breaking the game.
     */
    track(): () => void {
      let session: Promise<string | null> | null = null;
      let timer: ReturnType<typeof setInterval> | undefined;
      let stopped = false;

      const ping = () => {
        const current = session;
        if (!current) return;
        void current
          .then((id) => (id ? rpc('game_session_ping', { p_session: id }) : null))
          .catch(() => undefined);
      };
      const start = () => {
        if (stopped || timer !== undefined) return;
        // A new session after every pause: the time away never counts.
        session = rpc<string>('game_session_start').catch(() => null);
        timer = timers.setInterval(ping, PING_MS);
      };
      const pause = () => {
        if (timer === undefined) return;
        ping();
        timers.clearInterval(timer);
        timer = undefined;
        session = null;
      };
      const onVisibility = () => (document.visibilityState === 'visible' ? start() : pause());

      if (typeof document === 'undefined' || document.visibilityState !== 'hidden') start();
      if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', onVisibility);
      return () => {
        pause();
        stopped = true;
        if (typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', onVisibility);
      };
    },

    /**
     * Records a finished round. `stats` may only use the ids declared under `game.stats` in
     * mininode.json; other keys are dropped. `seconds` is the round's length.
     */
    async result(
      outcome: GameOutcome,
      stats: Record<string, number> = {},
      seconds?: number,
    ): Promise<void> {
      await rpc('game_result', {
        p_outcome: outcome,
        p_stats: stats,
        p_seconds: seconds === undefined ? null : Math.round(seconds),
      });
    },

    /** The player's own figures for this game. */
    async stats(): Promise<GameStats> {
      const rows =
        await rpc<
          {
            seconds: number;
            sessions: number;
            results: number;
            wins: number;
            losses: number;
            draws: number;
            last_played: string | null;
            records: Record<string, number>;
          }[]
        >('game_hub');
      const row = rows?.[0];
      return {
        seconds: Number(row?.seconds ?? 0),
        sessions: Number(row?.sessions ?? 0),
        results: Number(row?.results ?? 0),
        wins: Number(row?.wins ?? 0),
        losses: Number(row?.losses ?? 0),
        draws: Number(row?.draws ?? 0),
        lastPlayed: row?.last_played ?? null,
        records: Object.fromEntries(
          Object.entries(row?.records ?? {}).map(([k, v]) => [k, Number(v)]),
        ),
      };
    },

    /** Best value per player for one stat; only players with a username appear. */
    async leaderboard(stat: string, limit = 10): Promise<LeaderboardRow[]> {
      const rows = await rpc<
        { rank: number; username: string; value: number | string; mine: boolean }[]
      >('game_leaderboard', { p_slug: config.appSlug, p_stat: stat, p_limit: limit });
      return (rows ?? []).map((r) => ({
        rank: Number(r.rank),
        username: r.username,
        value: Number(r.value),
        mine: r.mine,
      }));
    },
  };
}
