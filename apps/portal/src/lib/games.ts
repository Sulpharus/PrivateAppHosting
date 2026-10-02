import { platform } from './supabase.ts';

// Gaming Hub (ADR 0009): the games one may play, one's playtime and results, and leaderboards.

export const GENRE_LABEL: Record<string, string> = {
  puzzle: 'Rätsel & Puzzle',
  arcade: 'Arcade & Geschick',
  karten: 'Kartenspiele',
  brett: 'Brettspiele',
  quiz: 'Quiz',
  wort: 'Wortspiele',
  strategie: 'Strategie',
  sonstiges: 'Weitere Spiele',
};
const GENRE_ORDER = Object.keys(GENRE_LABEL);

export interface StatDef {
  id: string;
  label: string;
  better: 'higher' | 'lower';
  format: 'number' | 'seconds';
}

export interface HubGame {
  slug: string;
  name: string;
  genre: string;
  players: 'solo' | 'multi' | 'both';
  stats: StatDef[];
  seconds: number;
  sessions: number;
  lastPlayed: string | null;
  results: number;
  wins: number;
  losses: number;
  draws: number;
  records: Record<string, number>;
  /** Logo in the bucket `app-icons` (ADR 0018). */
  icon_path?: string | null;
}

export interface GameDay {
  day: string;
  seconds: number;
  results: number;
}

export interface RecentRound {
  id: string;
  slug: string;
  name: string;
  at: string;
  outcome: 'win' | 'loss' | 'draw' | 'done';
  stats: Record<string, number>;
  seconds: number | null;
}

export interface LeaderRow {
  rank: number;
  username: string;
  value: number;
  mine: boolean;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await platform().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export async function loadHub(): Promise<HubGame[]> {
  const rows =
    await rpc<
      {
        slug: string;
        name: string;
        genre: string;
        players: string;
        stats: StatDef[];
        seconds: number;
        sessions: number;
        last_played: string | null;
        results: number;
        wins: number;
        losses: number;
        draws: number;
        records: Record<string, number | string>;
      }[]
    >('game_hub');
  // The logos live on the app rows, not in the hub function.
  const { data: icons } = await platform()
    .from('apps')
    .select('slug, icon_path')
    .in(
      'slug',
      (rows ?? []).map((r) => r.slug),
    );
  const iconOf = new Map(
    ((icons as { slug: string; icon_path: string | null }[] | null) ?? []).map((i) => [
      i.slug,
      i.icon_path,
    ]),
  );
  return (rows ?? []).map((r) => ({
    icon_path: iconOf.get(r.slug) ?? null,
    slug: r.slug,
    name: r.name,
    genre: GENRE_LABEL[r.genre] ? r.genre : 'sonstiges',
    players: (['solo', 'multi', 'both'].includes(r.players) ? r.players : 'solo') as
      | 'solo'
      | 'multi'
      | 'both',
    stats: Array.isArray(r.stats) ? r.stats : [],
    seconds: Number(r.seconds),
    sessions: Number(r.sessions),
    lastPlayed: r.last_played,
    results: Number(r.results),
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
    records: Object.fromEntries(Object.entries(r.records ?? {}).map(([k, v]) => [k, Number(v)])),
  }));
}

export async function loadDays(from: string): Promise<GameDay[]> {
  const rows = await rpc<{ day: string; seconds: number; results: number }[]>('game_days', {
    p_from: from,
  });
  return (rows ?? []).map((r) => ({
    day: r.day,
    seconds: Number(r.seconds),
    results: Number(r.results),
  }));
}

export async function loadRecent(slug?: string, limit = 20): Promise<RecentRound[]> {
  const rows = await rpc<
    {
      id: string;
      app_slug: string;
      name: string;
      at: string;
      outcome: RecentRound['outcome'];
      stats: Record<string, number>;
      seconds: number | null;
    }[]
  >('game_recent', { p_slug: slug ?? null, p_limit: limit });
  return (rows ?? []).map((r) => ({
    id: r.id,
    slug: r.app_slug,
    name: r.name,
    at: r.at,
    outcome: r.outcome,
    stats: r.stats ?? {},
    seconds: r.seconds,
  }));
}

export async function loadLeaderboard(slug: string, stat: string): Promise<LeaderRow[]> {
  const rows = await rpc<{ rank: number; username: string; value: number; mine: boolean }[]>(
    'game_leaderboard',
    { p_slug: slug, p_stat: stat, p_limit: 20 },
  );
  return (rows ?? []).map((r) => ({
    rank: Number(r.rank),
    username: r.username,
    value: Number(r.value),
    mine: r.mine,
  }));
}

export async function loadUsername(): Promise<string | null> {
  const rows = await rpc<{ username: string }[]>('game_profile');
  return rows?.[0]?.username ?? null;
}

export const USERNAME = /^[A-Za-z0-9_.-]{3,20}$/;

/** Saves the username; returns a German message when it cannot be used. */
export async function saveUsername(name: string | null): Promise<string | null> {
  const clean = name?.trim() || null;
  if (clean && !USERNAME.test(clean))
    return '3 bis 20 Zeichen: Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich.';
  const { error } = await platform().rpc('game_set_username', { p_username: clean });
  if (!error) return null;
  if (error.code === '23505') return 'Dieser Name ist schon vergeben.';
  if (error.code === '22023')
    return '3 bis 20 Zeichen: Buchstaben, Ziffern, Punkt, Unterstrich oder Bindestrich.';
  return 'Der Name konnte nicht gespeichert werden.';
}

/* ---------- presentation ---------- */

/** "2 Std. 5 Min.", "12 Min.", "unter 1 Min." */
export function playtime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return seconds > 0 ? 'unter 1 Min.' : '0 Min.';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} Min.`;
  return m ? `${h.toLocaleString('de-DE')} Std. ${m} Min.` : `${h.toLocaleString('de-DE')} Std.`;
}

export function statValue(def: Pick<StatDef, 'format'>, value: number): string {
  if (def.format === 'seconds') {
    const s = Math.round(value);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** Share of won rounds among rounds with a winner or a draw; null without any. */
export function winRate(g: Pick<HubGame, 'wins' | 'losses' | 'draws'>): number | null {
  const n = g.wins + g.losses + g.draws;
  return n ? g.wins / n : null;
}

/** Days in a row with play, ending today or yesterday. */
export function streak(days: GameDay[], today: string): number {
  const active = new Set(days.filter((d) => d.seconds > 0 || d.results > 0).map((d) => d.day));
  const at = new Date(`${today}T12:00:00Z`);
  if (!active.has(today)) at.setUTCDate(at.getUTCDate() - 1);
  let n = 0;
  while (active.has(at.toISOString().slice(0, 10))) {
    n++;
    at.setUTCDate(at.getUTCDate() - 1);
  }
  return n;
}

export function byGenre(games: HubGame[]): [string, HubGame[]][] {
  const groups = new Map<string, HubGame[]>();
  for (const g of games) groups.set(g.genre, [...(groups.get(g.genre) ?? []), g]);
  return [...groups].sort((a, b) => GENRE_ORDER.indexOf(a[0]) - GENRE_ORDER.indexOf(b[0]));
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  done: boolean;
}

/** Milestones computed from the figures; nothing is stored for them. */
export function achievements(games: HubGame[], bestStreak: number): Achievement[] {
  const total = (k: 'seconds' | 'results' | 'wins') => games.reduce((s, g) => s + g[k], 0);
  const played = games.filter((g) => g.results > 0 || g.seconds > 0).length;
  const list: [string, string, string, boolean][] = [
    ['first-round', 'Erste Runde', 'Beende eine Runde in einem Spiel.', total('results') >= 1],
    ['first-win', 'Erster Sieg', 'Gewinne eine Runde.', total('wins') >= 1],
    ['wins-10', 'Zehn Siege', 'Gewinne zehn Runden.', total('wins') >= 10],
    ['rounds-100', 'Hundert Runden', 'Beende hundert Runden.', total('results') >= 100],
    ['hour', 'Eine Stunde', 'Spiele insgesamt eine Stunde.', total('seconds') >= 3600],
    ['hours-10', 'Zehn Stunden', 'Spiele insgesamt zehn Stunden.', total('seconds') >= 36000],
    ['streak-3', 'Drei Tage am Stück', 'Spiele an drei Tagen hintereinander.', bestStreak >= 3],
    ['streak-7', 'Eine Woche am Stück', 'Spiele an sieben Tagen hintereinander.', bestStreak >= 7],
    ['allround', 'Allrounder', 'Spiele drei verschiedene Spiele.', played >= 3],
  ];
  return list.map(([id, title, hint, done]) => ({ id, title, hint, done }));
}

/** Longest run of consecutive active days in the list. */
export function longestStreak(days: GameDay[]): number {
  const active = days
    .filter((d) => d.seconds > 0 || d.results > 0)
    .map((d) => Date.parse(`${d.day}T12:00:00Z`))
    .sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let prev = Number.NaN;
  for (const t of active) {
    run = t - prev === 86_400_000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export const OUTCOME_LABEL: Record<RecentRound['outcome'], string> = {
  win: 'Gewonnen',
  loss: 'Verloren',
  draw: 'Unentschieden',
  done: 'Beendet',
};
