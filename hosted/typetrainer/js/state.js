// App state and data access. Lists live in tables (mn.table: sessions, texts, categories);
// settings and the daily challenge are small state in mn.kv. Stars and unlocked levels are
// derived from the lesson runs in `sessions`.
import { LAYOUTS } from './layouts.js';
import { levelStars } from './stats.js';

export const DEFAULT_SETTINGS = {
  layout: 'qwertz',
  /** Language of the practice texts: 'auto' follows the app language. */
  textLang: 'auto',
  /** 'stop': a wrong key must be corrected; 'continue': go on, Backspace allowed. */
  errorMode: 'stop',
  keyboard: true,
  dailyMinutes: 10,
  codeLanguage: 'python',
  difficulty: 'mittel',
  practiceKind: 'text',
};

export const DEFAULT_PROGRESS = {
  /** daily challenge: date of the last ranked attempt (Berlin), its result, streak */
  daily: { last: null, streak: 0, longest: 0, wpm: null, accuracy: null },
};

export const state = {
  mn: null,
  settings: { ...DEFAULT_SETTINGS },
  progress: structuredClone(DEFAULT_PROGRESS),
  sessions: [],
  /** "<course>#<level>" → best stars, from `sessions` */
  stars: {},
  /** true while the result card of a run is shown (a background sync must not replace it) */
  result: false,
  texts: [],
  categories: [],
  loading: true,
  error: null,
  run: null,
};

export const t = (key, params) => window.mnI18n.t(key, params);

/** The first n characters, never splitting an emoji or another surrogate pair. */
export const cut = (text, n) => Array.from(text).slice(0, n).join('');

export const textLang = () => {
  const lang = state.settings.textLang;
  return lang === 'de' || lang === 'en' ? lang : window.mnI18n.lang === 'en' ? 'en' : 'de';
};

export function mergeSettings(saved) {
  const merged = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  if (!LAYOUTS.some((l) => l.id === merged.layout)) merged.layout = DEFAULT_SETTINGS.layout;
  const minutes = Number(merged.dailyMinutes);
  merged.dailyMinutes =
    Number.isFinite(minutes) && minutes >= 1 && minutes <= 240 ? Math.round(minutes) : 10;
  return merged;
}

export function mergeProgress(saved) {
  const p = saved && typeof saved === 'object' ? saved : {};
  return { daily: { ...DEFAULT_PROGRESS.daily, ...(p.daily ?? {}) } };
}

const byCreated = (a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1);
const byPosition = (a, b) =>
  a.position - b.position || (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '');

/** Loads settings, progress and the three tables. Throws on a network error. */
export async function loadAll() {
  const mn = state.mn;
  const [settings, progress, sessions, texts, categories] = await Promise.all([
    mn.kv.get('settings'),
    mn.kv.get('progress'),
    mn.table('sessions').list(),
    mn.table('texts').list(),
    mn.table('categories').list(),
  ]);
  state.settings = mergeSettings(settings);
  state.progress = mergeProgress(progress);
  state.sessions = sessions.sort(byCreated);
  state.stars = levelStars(state.sessions);
  state.texts = texts.sort(byPosition);
  state.categories = categories.sort(byPosition);
}

export async function saveSettings(patch) {
  state.settings = mergeSettings({ ...state.settings, ...patch });
  await state.mn.kv.set('settings', state.settings);
}

/** Stores a new progress object, and keeps it in memory only once it is saved. */
export async function saveProgress(next) {
  await state.mn.kv.set('progress', next);
  state.progress = next;
}

/** Stores one finished run. */
export async function addSession(row) {
  const full = {
    id: state.mn.table('sessions').newId(),
    created_at: new Date().toISOString(),
    ...row,
  };
  await state.mn.table('sessions').upsert(stripLocal(full));
  state.sessions.unshift(full);
  state.stars = levelStars(state.sessions);
  return full;
}

const TEXT_COLUMNS = [
  'id',
  'category_id',
  'title',
  'body',
  'kind',
  'code_language',
  'position',
  'mastered',
];
const CATEGORY_COLUMNS = ['id', 'name', 'colour', 'position', 'archived'];
const SESSION_COLUMNS = [
  'id',
  'mode',
  'course',
  'level',
  'layout',
  'difficulty',
  'ranked',
  'wpm',
  'accuracy',
  'chars',
  'errors',
  'duration_ms',
  'stars',
  'practised_on',
  'details',
];

function pickColumns(row, columns) {
  return Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
}
function stripLocal(row) {
  return pickColumns(row, SESSION_COLUMNS);
}

export async function saveText(row) {
  const clean = pickColumns(row, TEXT_COLUMNS);
  clean.mastered = Boolean(clean.mastered);
  clean.kind = clean.kind === 'code' ? 'code' : 'text';
  if (clean.kind !== 'code') clean.code_language = null;
  await state.mn.table('texts').upsert(clean);
  const i = state.texts.findIndex((x) => x.id === row.id);
  if (i >= 0) state.texts[i] = { ...state.texts[i], ...clean };
  else state.texts.push(clean);
  state.texts.sort(byPosition);
}

export async function removeText(id) {
  await state.mn.table('texts').remove(id);
  state.texts = state.texts.filter((x) => x.id !== id);
}

export async function saveCategory(row) {
  const clean = pickColumns(row, CATEGORY_COLUMNS);
  clean.archived = Boolean(clean.archived);
  await state.mn.table('categories').upsert(clean);
  const i = state.categories.findIndex((x) => x.id === row.id);
  if (i >= 0) state.categories[i] = { ...state.categories[i], ...clean };
  else state.categories.push(clean);
  state.categories.sort(byPosition);
}

export async function removeCategory(id) {
  await state.mn.table('categories').remove(id);
  state.categories = state.categories.filter((x) => x.id !== id);
  for (const text of state.texts) if (text.category_id === id) text.category_id = null;
}

/** A position between two neighbours, so a move writes only one row. */
export function between(before, after) {
  if (before == null && after == null) return 1;
  if (before == null) return after - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/** Deletes every row and both kv keys of this app for the person. */
export async function deleteEverything() {
  const mn = state.mn;
  // Row by row; the lists in memory follow each delete, so a failure halfway shows what is left.
  for (const s of [...state.sessions]) {
    await mn.table('sessions').remove(s.id);
    state.sessions = state.sessions.filter((x) => x.id !== s.id);
  }
  for (const x of [...state.texts]) {
    await mn.table('texts').remove(x.id);
    state.texts = state.texts.filter((y) => y.id !== x.id);
  }
  for (const c of [...state.categories]) {
    await mn.table('categories').remove(c.id);
    state.categories = state.categories.filter((y) => y.id !== c.id);
  }
  state.stars = {};
  await mn.kv.delete('progress');
  await mn.kv.delete('settings');
  await mn.kv.delete('draft:text');
  state.sessions = [];
  state.texts = [];
  state.categories = [];
  state.progress = mergeProgress(null);
  state.settings = mergeSettings(null);
}
