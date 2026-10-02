// The game helpers (game.js): connection, timer with tracking, saving results, leaderboard.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Clock {
  start(): void;
  stop(): number;
  seconds(): number;
  penalty(s: number): void;
  reset(): void;
  attach(): void;
  readonly running: boolean;
}
interface MnGame {
  connect(o: { player?: string; hub?: string }): Promise<unknown>;
  timer(o: { onTick?: (s: number) => void; mn?: () => unknown }): Clock;
  report(mn: unknown, outcome: string, stats: object, seconds: number): Promise<boolean>;
  leaders(mn: unknown, host: string, o: { stat: string; unit?: string }): Promise<unknown>;
  format: { seconds(n: number): string; number(n: number): string };
  random(n: number): number;
}

const source = readFileSync(join(import.meta.dirname, 'game.js'), 'utf8');
let game: MnGame;

function fakeMn(over: Record<string, unknown> = {}) {
  const stop = vi.fn();
  const track = vi.fn(() => stop);
  const mn = {
    auth: { requireLogin: vi.fn(async () => ({})) },
    config: { portalUrl: 'https://mininode.app' },
    game: {
      hubUrl: () => 'https://mininode.app/games/x',
      username: async () => 'Lena',
      track,
      result: vi.fn(async () => undefined),
      stats: async () => ({ records: { time_1: 61 } }),
      leaderboard: async () => [
        { rank: 1, username: 'Max', value: 45, mine: false },
        { rank: 2, username: 'Lena', value: 61, mine: true },
      ],
      ...over,
    },
  };
  return { mn, track, stop };
}

beforeEach(() => {
  document.body.innerHTML = '<a id="hub">Hub</a><p id="player"></p><div id="lb"></div>';
  new Function(source)();
  game = (window as unknown as { mnGame: MnGame }).mnGame;
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as { mininode?: unknown }).mininode;
});

describe('connect', () => {
  it('links the hub and greets the player by name', async () => {
    const { mn } = fakeMn();
    (window as unknown as { mininode: unknown }).mininode = { mininode: async () => mn };
    expect(await game.connect({ player: '#player', hub: '#hub' })).toBe(mn);
    expect(document.querySelector<HTMLAnchorElement>('#hub')?.href).toBe(
      'https://mininode.app/games/x',
    );
    expect(document.querySelector('#player')?.textContent).toBe('Du spielst als Lena.');
  });

  it('points to the hub when there is no username, and survives being offline', async () => {
    const { mn } = fakeMn({ username: async () => null });
    (window as unknown as { mininode: unknown }).mininode = { mininode: async () => mn };
    await game.connect({ player: '#player' });
    expect(document.querySelector('#player a')?.getAttribute('href')).toBe(
      'https://mininode.app/games',
    );
    (window as unknown as { mininode: unknown }).mininode = {
      mininode: async () => {
        throw new Error('offline');
      },
    };
    expect(await game.connect({ player: '#player' })).toBeNull();
  });
});

describe('timer', () => {
  it('counts seconds, tracks playtime once and adds penalties', () => {
    vi.useFakeTimers();
    const { mn, track, stop } = fakeMn();
    const ticks: number[] = [];
    const clock = game.timer({ onTick: (s) => ticks.push(s), mn: () => mn });
    clock.start();
    clock.start();
    expect(track).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(clock.seconds()).toBe(3);
    clock.penalty(30);
    expect(clock.seconds()).toBe(33);
    expect(clock.stop()).toBe(33);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(clock.running).toBe(false);
    clock.reset();
    expect(clock.seconds()).toBe(0);
    expect(ticks.at(-1)).toBe(0);
  });

  it('starts tracking when the client arrives after the first move', () => {
    vi.useFakeTimers();
    const { mn, track } = fakeMn();
    let client: unknown = null;
    const clock = game.timer({ mn: () => client });
    clock.start();
    expect(track).not.toHaveBeenCalled();
    client = mn;
    clock.attach();
    clock.attach();
    expect(track).toHaveBeenCalledTimes(1);
    clock.stop();
  });

  it('does not count a pause between stop and start', () => {
    vi.useFakeTimers();
    const clock = game.timer({ mn: () => null });
    clock.start();
    vi.advanceTimersByTime(5000);
    expect(clock.stop()).toBe(5);
    vi.advanceTimersByTime(60_000);
    expect(clock.seconds()).toBe(5);
    clock.start();
    vi.advanceTimersByTime(2000);
    expect(clock.stop()).toBe(7);
  });

  it('works without a connection', () => {
    vi.useFakeTimers();
    const clock = game.timer({ mn: () => null });
    clock.start();
    vi.advanceTimersByTime(2000);
    expect(clock.stop()).toBe(2);
  });
});

describe('report and leaders', () => {
  it('saves a result with at least one second of playtime', async () => {
    const { mn } = fakeMn();
    expect(await game.report(mn, 'win', { time: 61 }, 0)).toBe(true);
    expect(mn.game.result).toHaveBeenCalledWith('win', { time: 61 }, 1);
    expect(await game.report(null, 'win', {}, 5)).toBe(false);
  });

  it('shows a toast when saving fails', async () => {
    const toast = vi.fn();
    (window as unknown as { mnui: unknown }).mnui = { toast };
    const { mn } = fakeMn({
      result: async () => {
        throw new Error('x');
      },
    });
    expect(await game.report(mn, 'win', {}, 5)).toBe(false);
    expect(toast).toHaveBeenCalled();
  });

  it('renders the leaderboard and returns the own record', async () => {
    const { mn } = fakeMn();
    const record = await game.leaders(mn, '#lb', { stat: 'time_1' });
    expect(record).toBe(61);
    const rows = [...document.querySelectorAll('#lb li')].map((li) => li.textContent);
    expect(rows).toEqual(['1.Max45', '2.Lena (du)61']);
    expect(document.querySelector('#lb li.mine')).not.toBeNull();
  });

  it('says so when the leaderboard is empty or unreachable', async () => {
    const empty = fakeMn({ leaderboard: async () => [] });
    await game.leaders(empty.mn, '#lb', { stat: 'time_1' });
    expect(document.querySelector('#lb')?.textContent).toContain('Noch keine Einträge');
    const broken = fakeMn({
      leaderboard: async () => {
        throw new Error('x');
      },
    });
    await game.leaders(broken.mn, '#lb', { stat: 'time_1' });
    expect(document.querySelector('#lb')?.textContent).toContain('nicht erreichbar');
  });
});

describe('format and random', () => {
  it('formats clocks and German numbers', () => {
    expect(game.format.seconds(75)).toBe('1:15');
    expect(game.format.seconds(3725)).toBe('1:02:05');
    expect(game.format.number(12345)).toBe('12.345');
  });

  it('draws integers in range', () => {
    for (let i = 0; i < 200; i++) {
      const n = game.random(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
});
