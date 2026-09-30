import { describe, expect, it } from 'vitest';
import {
  achievements,
  byGenre,
  type GameDay,
  type HubGame,
  longestStreak,
  playtime,
  statValue,
  streak,
  winRate,
} from './games.ts';

const day = (d: string, seconds = 60): GameDay => ({ day: d, seconds, results: 0 });
const game = (over: Partial<HubGame>): HubGame => ({
  slug: 'g',
  name: 'G',
  genre: 'puzzle',
  players: 'solo',
  stats: [],
  seconds: 0,
  sessions: 0,
  lastPlayed: null,
  results: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  records: {},
  ...over,
});

describe('games', () => {
  it('formats playtime and stats', () => {
    expect(playtime(0)).toBe('0 Min.');
    expect(playtime(30)).toBe('unter 1 Min.');
    expect(playtime(125 * 60)).toBe('2 Std. 5 Min.');
    expect(playtime(3600)).toBe('1 Std.');
    expect(statValue({ format: 'seconds' }, 95)).toBe('1:35');
    expect(statValue({ format: 'number' }, 1234.5)).toBe('1.234,5');
  });

  it('counts the current streak from today or yesterday', () => {
    const days = [day('2026-09-26'), day('2026-09-28'), day('2026-09-29')];
    expect(streak(days, '2026-09-30')).toBe(2);
    expect(streak([...days, day('2026-09-30')], '2026-09-30')).toBe(3);
    expect(streak([day('2026-09-27')], '2026-09-30')).toBe(0);
    expect(streak([day('2026-09-30', 0)], '2026-09-30')).toBe(0);
    expect(
      longestStreak([day('2026-09-01'), day('2026-09-02'), day('2026-09-03'), day('2026-09-10')]),
    ).toBe(3);
  });

  it('computes win rate, groups by genre and derives achievements', () => {
    expect(winRate({ wins: 0, losses: 0, draws: 0 })).toBeNull();
    expect(winRate({ wins: 3, losses: 1, draws: 0 })).toBe(0.75);
    const games = [
      game({ slug: 'q', genre: 'quiz', results: 2, wins: 1 }),
      game({ slug: 'm', genre: 'puzzle', seconds: 4000 }),
    ];
    expect(byGenre(games).map(([g]) => g)).toEqual(['puzzle', 'quiz']);
    const done = achievements(games, 3)
      .filter((a) => a.done)
      .map((a) => a.id);
    expect(done).toEqual(['first-round', 'first-win', 'hour', 'streak-3']);
  });
});
