// The learning tree of a layout. Every layout has its own tree, because key positions decide
// which letters come first, where code characters sit and which chords work:
//
//   Grundlagen (letters finger by finger, capitals, numbers, punctuation)
//   ├─ Schnellschreiben (frequent words, sentences, long words, speed, endurance)
//   ├─ Chording (whole words from keys pressed together)
//   └─ Code-Zeichen (brackets and operators on this layout)
//      ├─ Python
//      ├─ JavaScript
//      └─ Java
//
// A course is "<layout>/<branch>", a level within it "<course>#<n>". A branch opens once its
// parent course is complete (its last level has a star).
import { CHORD_GROUPS, chordTable, frequentWords } from './chords.js';
import { CODE_LANGUAGES, CODE_LEVELS, codeTarget, codeText, getCodeLanguage } from './code.js';
import {
  adapt,
  codeCharsText,
  lessonText,
  numbersText,
  practiceText,
  sentenceText,
  wordsText,
} from './generator.js';
import { getLayout, letterStages, typeable } from './layouts.js';

export const BRANCHES = [
  { id: 'basics', parent: null },
  { id: 'speed', parent: 'basics' },
  { id: 'chord', parent: 'basics' },
  { id: 'code', parent: 'basics' },
  ...CODE_LANGUAGES.map((c) => ({ id: `code-${c.id}`, parent: 'code', lang: c.id })),
];

/** Branches a person can choose as their focus. */
export const FOCUS = ['speed', 'chord', ...CODE_LANGUAGES.map((c) => `code-${c.id}`)];

export const courseOf = (layoutId, branch) => `${layoutId}/${branch}`;

export function parseCourse(course) {
  const at = course.indexOf('/');
  if (at < 0) return null;
  return { layout: course.slice(0, at), branch: course.slice(at + 1) };
}

const ramp = (from, to, count) => (i) =>
  Math.round(from + ((to - from) * i) / Math.max(1, count - 1));

/** The levels of one branch of a layout: [{ kind, number, target, … }]. */
export function branchLevels(layout, branch) {
  let levels;
  if (branch === 'basics') {
    const known = [];
    levels = letterStages(layout).map((chars) => {
      known.push(...chars);
      return { kind: 'letters', fresh: chars, known: [...known] };
    });
    levels.push(
      { kind: 'capitals', fresh: [], known: [...known] },
      { kind: 'numbers', fresh: [...'0123456789'], known: [...known] },
      { kind: 'punctuation', fresh: [...'.,;:!?-'], known: [...known] },
    );
    const target = ramp(12, 32, levels.length);
    return levels.map((l, i) => ({ ...l, number: i + 1, target: target(i) }));
  }
  if (branch === 'speed') {
    levels = ['common', 'sentences', 'long', 'mixed', 'speed', 'endurance'].map((kind) => ({
      kind,
    }));
    const target = ramp(30, 60, levels.length);
    return levels.map((l, i) => ({ ...l, number: i + 1, target: target(i) }));
  }
  if (branch === 'chord') {
    levels = [...CHORD_GROUPS.map((range) => ({ kind: 'chords', range })), { kind: 'chordText' }];
    const target = ramp(20, 50, levels.length);
    return levels.map((l, i) => ({ ...l, number: i + 1, target: target(i) }));
  }
  if (branch === 'code') {
    return [
      { kind: 'brackets', number: 1, target: 14 },
      { kind: 'operators', number: 2, target: 16 },
    ];
  }
  const lang = branch.replace(/^code-/, '');
  return CODE_LEVELS.map((id, i) => ({
    kind: 'code',
    id,
    lang,
    number: i + 1,
    target: codeTarget(i + 1),
  }));
}

export function courseLevels(course) {
  const parsed = parseCourse(course);
  if (!parsed) return [];
  return branchLevels(getLayout(parsed.layout), parsed.branch);
}

/** A course is complete when its last level has at least one star. */
export function isComplete(stars, course) {
  const count = courseLevels(course).length;
  return count > 0 && (stars[`${course}#${count}`] ?? 0) >= 1;
}

/** A branch is open when every course on its way up is complete. */
export function isOpen(stars, layoutId, branch) {
  let parent = BRANCHES.find((b) => b.id === branch)?.parent;
  while (parent) {
    if (!isComplete(stars, courseOf(layoutId, parent))) return false;
    parent = BRANCHES.find((b) => b.id === parent)?.parent;
  }
  return true;
}

/** The course to continue: Grundlagen until done, then the focus (or its parent first). */
export function continueCourse(stars, layoutId, focus) {
  const basics = courseOf(layoutId, 'basics');
  if (!isComplete(stars, basics)) return basics;
  const branch = FOCUS.includes(focus) ? focus : 'speed';
  if (isOpen(stars, layoutId, branch)) return courseOf(layoutId, branch);
  const parent = BRANCHES.find((b) => b.id === branch)?.parent;
  return courseOf(layoutId, parent ?? 'basics');
}

/**
 * The practice text of a level. Chord levels also return the chords that may be used.
 * @returns {{ text: string, chords?: Map<string, string[]>, code?: boolean }}
 */
export function levelText(layout, level, lang, rng) {
  const all = typeable(layout);
  const ok = (text) => [...text].every((ch) => all.has(ch));
  const fit = (text) => adapt(text, layout);
  switch (level.kind) {
    case 'letters':
    case 'capitals':
    case 'numbers':
    case 'punctuation':
      return { text: fit(lessonText(layout, level, lang, rng)) };
    case 'common':
      return { text: fit(frequentText(layout, lang, rng, 0, 100, 32)) };
    case 'sentences':
      return { text: fit(sentenceText(lang, rng, 180, () => true)) };
    case 'long':
      return { text: fit(wordsText(lang, rng, 18, { capitals: true, long: true })) };
    case 'mixed':
      return { text: fit(`${practiceText(lang, 'schwer', rng)} ${numbersText(lang, rng, 6)}`) };
    case 'speed':
      return { text: fit(sentenceText(lang, rng, 260, () => true)) };
    case 'endurance':
      return { text: fit(sentenceText(lang, rng, 700, () => true)) };
    case 'brackets':
    case 'operators':
      return { text: codeCharsText(level.kind, rng, ok), code: true };
    case 'code':
      return { text: fit(codeText(getCodeLanguage(level.lang), level.id, rng)), code: true };
    case 'chords':
    case 'chordText': {
      const table = chordTable(layout, lang, fit);
      const [from, to] = level.range ?? [0, table.length];
      // Earlier groups come back now and then, so they stay in the hands.
      const group = table.slice(from, to);
      const earlier = table.slice(0, from);
      const chords = new Map(table.slice(0, to).map((c) => [c.word, c.keys]));
      if (level.kind === 'chordText') {
        return {
          text: fit(sentenceText(lang, rng, 200, () => true)).toLocaleLowerCase('de-DE'),
          chords,
        };
      }
      const out = [];
      while (out.length < 30) {
        const pickFrom = earlier.length && rng() < 0.25 ? earlier : group;
        const word = pickFrom[Math.floor(rng() * pickFrom.length)]?.word;
        if (word && word !== out.at(-1)) out.push(word);
      }
      return { text: out.join(' '), chords };
    }
    default:
      return { text: fit(sentenceText(lang, rng, 180, () => true)) };
  }
}

function frequentText(layout, lang, rng, from, to, count) {
  const words = frequentWords(lang).slice(from, to);
  const out = [];
  while (out.length < count && words.length) {
    const word = words[Math.floor(rng() * words.length)];
    if (word !== out.at(-1)) out.push(word);
  }
  return out.join(' ');
}
