import { describe, expect, it } from 'vitest';
import { chordKey, chordTable } from '../js/chords.js';
import { CODE_LANGUAGES, CODE_LEVELS, codeText } from '../js/code.js';
import * as engine from '../js/engine.js';
import {
  adapt,
  berlinDate,
  dailyText,
  lessonText,
  mulberry32,
  practiceCode,
  practiceText,
  weakText,
} from '../js/generator.js';
import {
  FINGERS,
  getLayout,
  LAYOUTS,
  letterStages,
  locate,
  modifierFor,
  typeable,
} from '../js/layouts.js';
import { achievements, heat, streak, weakKeys, weeklyTrend, yearSummary } from '../js/stats.js';
import { BRANCHES, branchLevels, continueCourse, courseOf, isOpen, levelText } from '../js/tree.js';

describe('layouts', () => {
  it('match the xkb definitions of the Neo family', () => {
    const noted = getLayout('noted');
    expect(
      ['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'AC10']
        .map((k) => noted.keys[k][0])
        .join(''),
    ).toBe('csieodtnrh');
    expect(noted.keys.AC11).toBeUndefined();
    expect(noted.keys.AD11).toEqual(['j', 'J', '@']);
    expect(getLayout('neo').keys.AC03).toEqual(['a', 'A', '{']);
    expect(getLayout('bone').keys.AB10[0]).toBe('k');
  });

  it('locate characters with their layer and modifier', () => {
    const qwertz = getLayout('qwertz');
    expect(locate(qwertz, 'f')).toEqual({ key: 'AC04', layer: 0 });
    expect(locate(qwertz, 'F')).toEqual({ key: 'AC04', layer: 1 });
    expect(modifierFor(qwertz, locate(qwertz, 'F'))).toBe('RSHIFT');
    expect(locate(qwertz, '{')).toEqual({ key: 'AE07', layer: 2 });
    const neo = getLayout('neo');
    expect(locate(neo, '(')).toEqual({ key: 'AC07', layer: 2 });
    expect(modifierFor(neo, locate(neo, '('))).toBe('CAPS');
    expect(modifierFor(neo, locate(neo, '{'))).toBe('AC12');
    expect(modifierFor(getLayout('noted'), locate(getLayout('noted'), '{'))).toBe('AC11');
  });

  it('derive letter stages that cover every letter once', () => {
    for (const layout of LAYOUTS) {
      const stages = letterStages(layout);
      const all = stages.flat();
      expect(new Set(all).size).toBe(all.length);
      for (const ch of 'abcdefghijklmnopqrstuvwxyz') expect(all).toContain(ch);
      expect(stages[0].length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('generator', () => {
  it('lessons use only the keys learned so far', () => {
    for (const layout of LAYOUTS) {
      const levels = branchLevels(layout, 'basics');
      for (const level of levels.filter((l) => l.kind === 'letters')) {
        const text = lessonText(layout, level, 'de', mulberry32(level.number));
        const allowed = new Set([...level.known, ' ']);
        for (const ch of text)
          expect(allowed.has(ch), `${layout.id} ${level.number} ${ch}`).toBe(true);
      }
    }
  });

  it('adapt makes every text typeable on QWERTY', () => {
    const qwerty = getLayout('qwerty');
    const all = typeable(qwerty);
    const text = adapt(
      dailyText('2026-11-26', 'de') + practiceText('de', 'schwer', mulberry32(3)),
      qwerty,
    );
    for (const ch of text) expect(all.has(ch), ch).toBe(true);
  });

  it('the daily challenge is the same for everyone on a day', () => {
    expect(dailyText('2026-11-26', 'en')).toBe(dailyText('2026-11-26', 'en'));
    expect(dailyText('2026-11-26', 'en')).not.toBe(dailyText('2026-11-27', 'en'));
    expect(berlinDate(new Date('2026-11-26T23:30:00Z'))).toBe('2026-11-27');
  });

  it('code texts exist for every language and level', () => {
    for (const lang of CODE_LANGUAGES)
      for (const id of CODE_LEVELS) {
        const text = codeText(lang, id, mulberry32(7));
        expect(text.length).toBeGreaterThan(20);
        expect(text).not.toMatch(/\{[abcfCnms]\}/);
      }
    expect(practiceCode('python', 'schwer', mulberry32(1))).toContain('\n');
  });

  it('weak-key drills contain the weak keys', () => {
    expect(weakText('de', ['q', 'x'], mulberry32(2))).toMatch(/[qx]/);
  });
});

describe('engine', () => {
  it('stops on a mistake and counts it', () => {
    const run = engine.createRun('ab');
    engine.input(run, 'x', 0);
    expect(run.pos).toBe(0);
    expect(run.errors).toBe(1);
    engine.input(run, 'a', 1000);
    expect(run.status[0]).toBe(engine.FIXED);
    const res = engine.input(run, 'b', 12000);
    expect(res.done).toBe(true);
    const out = engine.result(run);
    expect(out.chars).toBe(2);
    expect(out.accuracy).toBeCloseTo(66.67, 1);
    expect(out.keys.a).toEqual([2, 1]);
  });

  it('goes on after a mistake and corrects with Backspace', () => {
    const run = engine.createRun('abc', { stopOnError: false });
    engine.input(run, 'x', 0);
    expect(run.pos).toBe(1);
    engine.backspace(run);
    expect(run.pos).toBe(0);
    engine.input(run, 'a', 10);
    engine.input(run, 'b', 20);
    engine.input(run, 'c', 30);
    expect(engine.isDone(run)).toBe(true);
  });

  it('fills in indentation after a line break', () => {
    const run = engine.createRun('if x:\n    y');
    for (const ch of 'if x:\n') engine.input(run, ch, 0);
    expect(run.text[run.pos]).toBe('y');
    expect(engine.correctChars(run)).toBe(6);
  });

  it('computes words per minute and stars', () => {
    expect(engine.wpm(250, 60000)).toBe(50);
    expect(engine.stars({ wpm: 40, accuracy: 98 }, 30)).toBe(3);
    expect(engine.stars({ wpm: 31, accuracy: 95 }, 30)).toBe(2);
    expect(engine.stars({ wpm: 10, accuracy: 92 }, 30)).toBe(1);
    expect(engine.stars({ wpm: 80, accuracy: 85 }, 30)).toBe(0);
  });
});

describe('stats', () => {
  const run = (day, wpm, extra = {}) => ({
    id: `${day}-${wpm}`,
    practised_on: day,
    wpm,
    accuracy: 95,
    chars: 100,
    duration_ms: 120000,
    course: 'layout:neo',
    mode: 'lesson',
    created_at: `${day}T10:00:00Z`,
    details: { keys: { q: [10, 4], e: [50, 1] } },
    ...extra,
  });
  const sessions = [run('2026-11-24', 30), run('2026-11-25', 40), run('2026-11-26', 50)];

  it('counts the streak', () => {
    expect(streak(sessions, '2026-11-26')).toBe(3);
    expect(streak(sessions, '2026-11-27')).toBe(3);
    expect(streak(sessions, '2026-11-29')).toBe(0);
  });

  it('summarises a year and its weeks', () => {
    const s = yearSummary(sessions, 2026);
    expect(s.best).toBe(50);
    expect(s.avg).toBe(40);
    expect(s.minutes).toBe(6);
    const weeks = weeklyTrend(sessions, '2026-11-26');
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1).wpm).toBe(40);
    expect(heat(sessions, 2026)).toHaveLength(365);
  });

  it('finds weak keys and badges', () => {
    expect(weakKeys(sessions)[0].ch).toBe('q');
    const badges = achievements(sessions, { stars: {}, levels: {}, daily: {} }, '2026-11-26');
    expect(badges.find((b) => b.id === 'wpm50').done).toBe(true);
    expect(badges.find((b) => b.id === 'wpm70').done).toBe(false);
  });
});

describe('progress', async () => {
  const { levelStars, nextDaily, unlockedFrom, groupStars } = await import('../js/stats.js');
  const lesson = (course, level, stars) => ({
    mode: 'lesson',
    course,
    level,
    stars,
    practised_on: '2026-11-26',
  });

  it('derives stars and unlocked levels from the runs', () => {
    const stars = levelStars([
      lesson('layout:neo', 1, 1),
      lesson('layout:neo', 1, 3),
      lesson('layout:neo', 2, 0),
      lesson('code:java', 1, 2),
    ]);
    expect(stars['layout:neo#1']).toBe(3);
    expect(unlockedFrom(stars, 'layout:neo')).toBe(2);
    expect(unlockedFrom(stars, 'code:java')).toBe(2);
    expect(unlockedFrom(stars, 'layout:qwerty')).toBe(1);
    expect(groupStars(stars, { 'layout:neo': 1 })['layout:neo'].full).toBe(true);
  });

  it('counts the daily streak once per day', () => {
    const res = { wpm: 40, accuracy: 97 };
    const first = nextDaily({ last: null, streak: 0, longest: 0 }, res, '2026-11-25', '2026-11-24');
    expect(first).toMatchObject({ last: '2026-11-25', streak: 1, longest: 1 });
    const second = nextDaily(first, res, '2026-11-26', '2026-11-25');
    expect(second).toMatchObject({ streak: 2, longest: 2 });
    expect(nextDaily(second, res, '2026-11-26', '2026-11-25')).toBeNull();
    expect(nextDaily(second, res, '2026-11-28', '2026-11-27')).toMatchObject({
      streak: 1,
      longest: 2,
    });
  });

  it('a finished run ignores Backspace', () => {
    const run = engine.createRun('ab', { stopOnError: false });
    engine.input(run, 'a', 0);
    engine.input(run, 'b', 10);
    expect(engine.backspace(run)).toBeNull();
    expect(engine.isDone(run)).toBe(true);
  });
});

describe('learning tree', () => {
  it('opens the branches after the basics, the languages after the code characters', () => {
    const basics = branchLevels(getLayout('neo'), 'basics').length;
    expect(isOpen({}, 'neo', 'speed')).toBe(false);
    const stars = { [`neo/basics#${basics}`]: 1 };
    expect(isOpen(stars, 'neo', 'speed')).toBe(true);
    expect(isOpen(stars, 'neo', 'code-python')).toBe(false);
    expect(isOpen({ ...stars, 'neo/code#2': 2 }, 'neo', 'code-python')).toBe(true);
    expect(isOpen(stars, 'qwertz', 'speed')).toBe(false);
    expect(continueCourse({}, 'neo', 'chord')).toBe('neo/basics');
    expect(continueCourse(stars, 'neo', 'chord')).toBe('neo/chord');
    expect(continueCourse(stars, 'neo', 'code-java')).toBe('neo/code');
  });

  it('every level of every branch makes a text that fits the layout', () => {
    for (const layout of LAYOUTS)
      for (const branch of BRANCHES) {
        for (const level of branchLevels(layout, branch.id)) {
          const { text } = levelText(layout, level, 'de', mulberry32(level.number));
          expect(text.length, `${courseOf(layout.id, branch.id)} ${level.number}`).toBeGreaterThan(
            10,
          );
          if (branch.id !== 'basics') {
            const all = typeable(layout);
            for (const ch of text)
              expect(all.has(ch), `${layout.id}/${branch.id} ${ch}`).toBe(true);
          }
        }
      }
  });
});

describe('chords', () => {
  it('use only letters of the word, never two keys of one finger, each chord once', () => {
    for (const layout of LAYOUTS)
      for (const lang of ['de', 'en']) {
        const table = chordTable(layout, lang, (w) => adapt(w, layout));
        expect(table.length).toBeGreaterThan(80);
        const seen = new Set();
        for (const { word, keys } of table) {
          for (const k of keys) expect(word).toContain(k);
          const fingers = keys.map((k) => FINGERS[locate(layout, k).key]);
          expect(new Set(fingers).size).toBe(keys.length);
          expect(seen.has(chordKey(keys))).toBe(false);
          seen.add(chordKey(keys));
          expect(keys.length).toBeGreaterThanOrEqual(2);
          expect(keys.length).toBeLessThanOrEqual(4);
        }
      }
  });

  it('start with the first letter of the word where possible', () => {
    const table = chordTable(getLayout('qwertz'), 'de', (w) => w);
    const und = table.find((c) => c.word === 'und');
    expect(und.keys[0]).toBe('u');
    const firsts = table.filter((c) => c.keys[0] === c.word[0]).length;
    expect(firsts / table.length).toBeGreaterThan(0.9);
  });

  it('a chord types the whole word and its space', () => {
    const run = engine.createRun('und die');
    expect(engine.wordAt(run)).toBe('und');
    const res = engine.inputWord(run, 'und', 0);
    expect(res.changed).toContain(3);
    expect(run.pos).toBe(4);
    expect(engine.wordAt(run)).toBe('die');
    engine.input(run, 'd', 10);
    expect(engine.wordAt(run)).toBeNull();
    expect(engine.inputWord(run, 'die', 20)).toBeNull();
    engine.chordMiss(run, 30);
    expect(run.errors).toBe(1);
  });
});
