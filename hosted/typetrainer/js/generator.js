// Practice texts, all made by script (no AI): lessons of the learning path, random practice, the
// daily challenge and drills for weak keys.
import { CODE_LEVELS, codeTarget, codeText, getCodeLanguage } from './code.js';
import { letterStages, typeable } from './layouts.js';
import { SENTENCES, WORDS } from './words.js';

/** Small seeded random generator (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The learning path of a layout: letter stages, then capitals, numbers, punctuation, symbols, speed. */
export function layoutLevels(layout) {
  const stages = letterStages(layout);
  const levels = [];
  const known = [];
  stages.forEach((chars) => {
    known.push(...chars);
    levels.push({ kind: 'letters', fresh: chars, known: [...known] });
  });
  levels.push({ kind: 'capitals', fresh: [], known: [...known] });
  levels.push({ kind: 'numbers', fresh: [...'0123456789'], known: [...known] });
  levels.push({ kind: 'punctuation', fresh: [...'.,;:!?-'], known: [...known] });
  levels.push({ kind: 'symbols', fresh: [...'()[]{}<>=+*/'], known: [...known] });
  levels.push({ kind: 'sentences', fresh: [], known: [...known] });
  levels.push({ kind: 'speed', fresh: [], known: [...known] });
  return levels.map((level, i) => ({
    ...level,
    number: i + 1,
    target: layoutTarget(i, levels.length),
  }));
}

/** Target speed: from 12 WPM on the first level up to 45 WPM on the last. */
function layoutTarget(index, count) {
  return Math.round(12 + (33 * index) / Math.max(1, count - 1));
}

export function codeLevels(langId) {
  const lang = getCodeLanguage(langId);
  return CODE_LEVELS.map((id, i) => ({
    kind: 'code',
    id,
    lang: lang.id,
    number: i + 1,
    target: codeTarget(i + 1),
  }));
}

/** All courses: one per layout and one per programming language. */
export function courseId(type, id) {
  return `${type}:${id}`;
}

const lower = (w) => w.toLocaleLowerCase('de-DE');

/** Words that only use the given characters (lower case). */
function wordsFrom(lang, allowed) {
  const set = new Set(allowed);
  const seen = new Set();
  const out = [];
  for (const w of WORDS[lang]) {
    const l = lower(w);
    if (seen.has(l) || ![...l].every((ch) => set.has(ch))) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

/** Made-up syllables from the allowed letters, weighted towards the new ones. */
function pseudo(rng, known, fresh) {
  const letters = known.filter((ch) => /\p{L}/u.test(ch));
  const focus = fresh.filter((ch) => /\p{L}/u.test(ch));
  const length = 2 + Math.floor(rng() * 4);
  let word = '';
  for (let i = 0; i < length; i++)
    word += rng() < 0.5 && focus.length ? pick(rng, focus) : pick(rng, letters);
  return word;
}

/** Repetitions of the new keys: "ff jj fj jf". */
function drill(rng, fresh) {
  const letters = fresh.filter((ch) => /\p{L}/u.test(ch));
  if (letters.length === 0) return [];
  const out = [];
  for (const ch of letters) out.push(ch.repeat(3));
  for (let i = 0; i < 4; i++)
    out.push(Array.from({ length: 3 }, () => pick(rng, letters)).join(''));
  return out;
}

/** A lesson of a layout level, about `words` words long, in the practice language. */
export function lessonText(layout, level, lang, rng, words = 28) {
  const all = typeable(layout);
  const ok = (text) => [...text].every((ch) => all.has(ch));
  if (level.kind === 'letters') {
    const letters = level.known.filter((ch) => /\p{L}/u.test(ch));
    const pool = wordsFrom(lang, letters);
    const fresh = pool.filter((w) => level.fresh.some((ch) => w.includes(ch)));
    const out = level.number <= 5 ? drill(rng, level.fresh) : [];
    // Few real words fit the first levels: mix in more made-up ones instead of repeating them.
    const freshShare = fresh.length >= 6 ? 0.55 : fresh.length * 0.08;
    while (out.length < words) {
      const r = rng();
      let word;
      if (fresh.length && r < freshShare) word = pick(rng, fresh);
      else if (pool.length > 8 && r < 0.85) word = pick(rng, pool);
      else word = pseudo(rng, letters, level.fresh);
      if (word !== out.at(-1)) out.push(word);
    }
    // Comma and full stop come in once they are on a learned key.
    const punct = level.known.filter((ch) => ch === ',' || ch === '.');
    if (punct.length) for (let i = 3; i < out.length; i += 5) out[i] += pick(rng, punct);
    return out.join(' ');
  }
  if (level.kind === 'capitals') return wordsText(lang, rng, words, { capitals: true });
  if (level.kind === 'numbers') return numbersText(lang, rng, words);
  if (level.kind === 'punctuation') return sentenceText(lang, rng, words * 6, ok);
  if (level.kind === 'symbols') return symbolsText(rng, words, ok);
  if (level.kind === 'sentences') return sentenceText(lang, rng, words * 6, ok);
  return sentenceText(lang, rng, words * 8, ok);
}

/** Real words with their own capitals (German nouns) or all lower case. */
function wordsText(lang, rng, count, { capitals, long } = {}) {
  let pool = WORDS[lang];
  if (!long) pool = pool.filter((w) => w.length <= 7);
  const out = [];
  while (out.length < count) {
    let w = pick(rng, pool);
    if (!capitals) w = lower(w);
    out.push(w);
  }
  return out.join(' ');
}

function numbersText(lang, rng, count) {
  const out = [];
  while (out.length < count) {
    const r = rng();
    if (r < 0.4) out.push(String(Math.floor(rng() * 1000)));
    else if (r < 0.55) out.push(String(1950 + Math.floor(rng() * 80)));
    else out.push(lower(pick(rng, WORDS[lang])));
  }
  return out.join(' ');
}

function sentenceText(lang, rng, chars, ok) {
  const list = shuffle(rng, SENTENCES[lang].filter(ok));
  const out = [];
  let length = 0;
  for (const s of list) {
    if (length >= chars) break;
    out.push(s);
    length += s.length + 1;
  }
  return out.join(' ');
}

function symbolsText(rng, count, ok) {
  const names = ['a', 'b', 'x', 'y', 'n', 'sum', 'max', 'list', 'item', 'total'];
  const forms = [
    () => `(${pick(rng, names)} + ${pick(rng, names)})`,
    () => `[${Math.floor(rng() * 10)}]`,
    () => `{${pick(rng, names)}}`,
    () => `${pick(rng, names)} = ${Math.floor(rng() * 100)}`,
    () => `${pick(rng, names)} < ${pick(rng, names)}`,
    () => `${pick(rng, names)} > ${Math.floor(rng() * 10)}`,
    () => `${pick(rng, names)} * ${Math.floor(rng() * 10)}`,
    () => `${pick(rng, names)} / ${Math.floor(rng() * 9) + 1}`,
    () => `<${pick(rng, names)}>`,
  ];
  const out = [];
  while (out.length < count / 2) {
    const piece = pick(rng, forms)();
    if (ok(piece)) out.push(piece);
  }
  return out.join(' ');
}

/** Free practice: prose by difficulty. */
export function practiceText(lang, difficulty, rng) {
  if (difficulty === 'leicht') return wordsText(lang, rng, 25);
  if (difficulty === 'mittel') return sentenceText(lang, rng, 200, () => true);
  return `${sentenceText(lang, rng, 260, () => true)} ${numbersText(lang, rng, 8)}`;
}

/** Free practice: code by difficulty, mixed from all levels of a language. */
export function practiceCode(langId, difficulty, rng) {
  const lang = getCodeLanguage(langId);
  const level =
    difficulty === 'leicht' ? 'values' : difficulty === 'mittel' ? 'functions' : 'programs';
  const chars = difficulty === 'leicht' ? 160 : difficulty === 'mittel' ? 260 : 380;
  return codeText(lang, level, rng, chars);
}

/** The daily challenge: the same text for everyone on the same Berlin date and language. */
export function dailyText(dateKey, lang) {
  const rng = mulberry32(Number(dateKey.replaceAll('-', '')));
  return sentenceText(lang, rng, 220, () => true);
}

/** A drill for the weakest characters: words that contain them, plus short repetitions. */
export function weakText(lang, chars, rng, count = 30) {
  const letters = chars.filter((ch) => /\p{L}/u.test(ch));
  const pool = WORDS[lang].filter((w) => letters.some((ch) => lower(w).includes(ch)));
  const others = chars.filter((ch) => !/\p{L}/u.test(ch) && ch.trim());
  const out = [];
  while (out.length < count) {
    const r = rng();
    if (pool.length && r < 0.7) out.push(lower(pick(rng, pool)));
    else if (others.length && r < 0.85) out.push(pick(rng, others) + lower(pick(rng, WORDS[lang])));
    else if (letters.length) out.push(Array.from({ length: 3 }, () => pick(rng, letters)).join(''));
    else out.push(lower(pick(rng, WORDS[lang])));
  }
  return out.join(' ');
}

/** The date in Europe/Berlin as YYYY-MM-DD (the daily challenge changes at midnight there). */
export function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Milliseconds until the next midnight in Berlin. */
export function msToBerlinMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const passed =
    (Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return 24 * 3600 * 1000 - passed - now.getMilliseconds();
}

const SUBSTITUTES = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  ẞ: 'SS',
  '„': '"',
  '“': '"',
  '”': '"',
  '‚': "'",
  '‘': "'",
  '’': "'",
  '–': '-',
  '—': '-',
  '…': '...',
};

/** Replaces characters the layout cannot type (umlauts on QWERTY) with what it can. */
export function adapt(text, layout) {
  const all = typeable(layout);
  return [...text].map((ch) => (all.has(ch) ? ch : (SUBSTITUTES[ch] ?? ch))).join('');
}
