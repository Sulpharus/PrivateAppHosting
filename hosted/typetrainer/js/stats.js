// Statistics, computed from the stored runs every time (nothing derived is stored).

/** Local date as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

const num = (v) => (typeof v === 'number' ? v : Number(v));

/** Days in a row with at least one run, ending today (or yesterday, if today is still open). */
export function streak(sessions, today = dayKey()) {
  const days = new Set(sessions.map((s) => s.practised_on));
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

export function minutesOn(sessions, day) {
  return (
    sessions.filter((s) => s.practised_on === day).reduce((sum, s) => sum + num(s.duration_ms), 0) /
    60000
  );
}

/** Key figures for one year. Average speed is weighted by the characters of each run. */
export function yearSummary(sessions, year) {
  const list = sessions.filter((s) => s.practised_on.startsWith(String(year)));
  if (list.length === 0) return { count: 0, best: 0, avg: 0, accuracy: 0, minutes: 0 };
  const chars = list.reduce((sum, s) => sum + num(s.chars), 0);
  return {
    count: list.length,
    best: Math.max(...list.map((s) => num(s.wpm))),
    avg: list.reduce((sum, s) => sum + num(s.wpm) * num(s.chars), 0) / chars,
    accuracy: list.reduce((sum, s) => sum + num(s.accuracy) * num(s.chars), 0) / chars,
    minutes: list.reduce((sum, s) => sum + num(s.duration_ms), 0) / 60000,
  };
}

/** Monday of the week of a day key. */
export function weekStart(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const shift = (date.getDay() + 6) % 7;
  return dayKey(new Date(y, m - 1, d - shift));
}

/** Average speed per week for the last `weeks` weeks up to `today` (null for weeks without runs). */
export function weeklyTrend(sessions, today = dayKey(), weeks = 12) {
  const last = weekStart(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(last, -7 * i);
    const end = addDays(start, 7);
    const list = sessions.filter((s) => s.practised_on >= start && s.practised_on < end);
    const chars = list.reduce((sum, s) => sum + num(s.chars), 0);
    out.push({
      start,
      wpm: chars ? list.reduce((sum, s) => sum + num(s.wpm) * num(s.chars), 0) / chars : null,
      count: list.length,
    });
  }
  return out;
}

/** Minutes per day of a year, with an intensity level 0–3 for the heat grid. */
export function heat(sessions, year) {
  const minutes = new Map();
  for (const s of sessions) {
    if (!s.practised_on.startsWith(String(year))) continue;
    minutes.set(s.practised_on, (minutes.get(s.practised_on) ?? 0) + num(s.duration_ms) / 60000);
  }
  const days = [];
  for (let key = `${year}-01-01`; key.startsWith(String(year)); key = addDays(key, 1)) {
    const m = minutes.get(key) ?? 0;
    days.push({ key, minutes: m, level: m === 0 ? 0 : m < 5 ? 1 : m < 15 ? 2 : 3 });
  }
  return days;
}

/**
 * The characters with the highest error rate over the most recent runs.
 * @returns {{ ch: string, typed: number, wrong: number, rate: number }[]}
 */
export function weakKeys(sessions, { recent = 40, minTyped = 8, limit = 8 } = {}) {
  const list = [...sessions]
    .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1))
    .slice(0, recent);
  const totals = new Map();
  for (const s of list) {
    const keys = s.details?.keys ?? {};
    for (const [ch, pair] of Object.entries(keys)) {
      if (!Array.isArray(pair) || ch === '\n') continue;
      const t = totals.get(ch) ?? [0, 0];
      t[0] += num(pair[0]) || 0;
      t[1] += num(pair[1]) || 0;
      totals.set(ch, t);
    }
  }
  return [...totals]
    .filter(([, [typed, wrong]]) => typed >= minTyped && wrong > 0)
    .map(([ch, [typed, wrong]]) => ({ ch, typed, wrong, rate: wrong / typed }))
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong)
    .slice(0, limit);
}

/** Best speed per course. */
export function courseBests(sessions) {
  const best = new Map();
  for (const s of sessions) best.set(s.course, Math.max(best.get(s.course) ?? 0, num(s.wpm)));
  return [...best].map(([course, wpm]) => ({ course, wpm })).sort((a, b) => b.wpm - a.wpm);
}

/** The best earlier result for the same kind of run (to call out a new record). */
export function previousBest(sessions, run) {
  const same = sessions.filter(
    (s) =>
      s.mode === run.mode &&
      s.course === run.course &&
      (s.difficulty ?? null) === (run.difficulty ?? null) &&
      s.id !== run.id,
  );
  return same.length ? Math.max(...same.map((s) => num(s.wpm))) : null;
}

/** Badges, all derived from the runs and the progress. */
export function achievements(sessions, progress, today = dayKey(), levelCounts = {}) {
  const best = sessions.length ? Math.max(...sessions.map((s) => num(s.wpm))) : 0;
  const longest = longestStreak(sessions);
  const threeStarCourse = Object.values(groupStars(levelStars(sessions), levelCounts)).some(
    (s) => s.full,
  );
  const precise = sessions.some((s) => num(s.accuracy) >= 99 && num(s.chars) >= 150);
  const code = sessions.filter(
    (s) => s.course.startsWith('code:') || /\/code(-|$)/.test(s.course),
  ).length;
  const daily = Math.max(progress?.daily?.streak ?? 0, progress?.daily?.longest ?? 0) >= 7;
  return [
    { id: 'first', done: sessions.length > 0 },
    { id: 'wpm30', done: best >= 30 },
    { id: 'wpm50', done: best >= 50 },
    { id: 'wpm70', done: best >= 70 },
    { id: 'wpm100', done: best >= 100 },
    { id: 'precise', done: precise },
    { id: 'streak7', done: longest >= 7 || streak(sessions, today) >= 7 },
    { id: 'streak30', done: longest >= 30 },
    { id: 'coder', done: code >= 25 },
    { id: 'daily7', done: Boolean(daily) },
    { id: 'master', done: threeStarCourse },
  ];
}

function longestStreak(sessions) {
  const days = [...new Set(sessions.map((s) => s.practised_on))].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Best stars per level, from the lesson runs: { "<course>#<level>": 0–3 }. */
export function levelStars(sessions) {
  const out = {};
  for (const s of sessions) {
    if (s.mode !== 'lesson' || s.level == null) continue;
    const key = `${s.course}#${s.level}`;
    out[key] = Math.max(out[key] ?? 0, num(s.stars) || 0);
  }
  return out;
}

/** The highest open level of a course: the one after the furthest level with a star. */
export function unlockedFrom(stars, course) {
  let open = 1;
  for (const [key, value] of Object.entries(stars)) {
    const at = key.lastIndexOf('#');
    if (key.slice(0, at) === course && value >= 1)
      open = Math.max(open, Number(key.slice(at + 1)) + 1);
  }
  return open;
}

/** Stars per course, and whether every level has three (levelCounts: course → number of levels). */
export function groupStars(stars, levelCounts = {}) {
  const out = {};
  for (const [key, value] of Object.entries(stars)) {
    const course = key.slice(0, key.lastIndexOf('#'));
    out[course] ??= { stars: 0, levels: levelCounts[course] ?? 0, full: false };
    out[course].stars += value;
  }
  for (const s of Object.values(out)) s.full = s.levels > 0 && s.stars >= s.levels * 3;
  return out;
}

/**
 * The daily challenge after a finished attempt on `date` (Berlin): the first attempt of a day is
 * ranked and continues or restarts the streak; later attempts change nothing (null).
 */
export function nextDaily(daily, res, date, yesterday) {
  if (daily.last === date) return null;
  const streak = daily.last === yesterday ? (daily.streak ?? 0) + 1 : 1;
  return {
    last: date,
    streak,
    longest: Math.max(daily.longest ?? 0, streak),
    wpm: res.wpm,
    accuracy: res.accuracy,
  };
}
