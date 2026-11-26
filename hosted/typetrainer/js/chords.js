// Chording: a whole word from keys pressed at the same time. The system is our own and simple:
// a chord uses only letters of the word itself, like a spoken short form, first letter first,
// then its consonants ("nicht" → n t, "because" → b c), then vowels. One finger cannot press two
// keys at once, so a chord never has two letters on the same finger. That depends on where the
// letters sit, so every layout gets its own table, built the same way every time.
import { FINGERS, locate } from './layouts.js';

/** The most frequent words, most frequent first. Chord levels take them in this order. */
export const FREQUENT = {
  de: `und die der nicht das ist ich es sie zu den mit sich ein auf du in auch eine wir dass so von
er was wie aber für noch an dem als nur wenn dann schon aus bei man kann mehr hat oder nach um
sind jetzt hier immer war mal einen alle ganz gut wird doch heute viel sehr ohne über unter wieder
haben werden können müssen machen gehen kommen sagen sehen wissen geben denken bitte danke morgen
vielleicht eigentlich natürlich zusammen zwischen während weil deshalb trotzdem genau gerade etwas
nichts jemand niemand vielen wichtig richtig zeit leute arbeit frage antwort beispiel`,
  en: `the and to of that it is in you for was with on as have be at not this but they his from
she by or we an will my one all would there their what so up out if about who get which go me
when make can like time no just him know take people into year your good some could them see
other than then now look only come its over think also back after use two how our work first well
way even new want because any these give day most us thing should never always every really
something nothing without another before around between through during again still while`,
};

/** The frequent words of a language, most frequent first. */
export const frequentWords = (lang) => [
  ...new Set(FREQUENT[lang].split(/\s+/).filter((w) => w.length > 1)),
];
const words = frequentWords;

const cache = new Map();

/** All subsets of `items` with `size` elements, in order of priority. */
function* combinations(items, size, start = 0, picked = []) {
  if (picked.length === size) {
    yield picked;
    return;
  }
  for (let i = start; i < items.length; i++)
    yield* combinations(items, size, i + 1, [...picked, items[i]]);
}

/** A chord's identity: its letters, sorted (the order of pressing does not matter). */
export const chordKey = (letters) => [...new Set(letters)].sort().join('');

/**
 * The chord table of a layout for a language: [{ word, keys }] in frequency order. Words whose
 * letters cannot form a free chord on this layout are left out (they are typed as usual).
 * @param {(text: string) => string} adaptWord makes the word typeable on the layout (QWERTY umlauts)
 */
export function chordTable(layout, lang, adaptWord = (w) => w) {
  const id = `${layout.id}/${lang}`;
  if (cache.has(id)) return cache.get(id);
  const used = new Set();
  const table = [];
  for (const raw of words(lang)) {
    const word = adaptWord(raw).toLocaleLowerCase('de-DE');
    const letters = [...new Set(word)].filter(
      (ch) => /\p{L}/u.test(ch) && locate(layout, ch)?.layer === 0,
    );
    if (letters.length < 2) continue;
    const first = letters[0];
    const rest = letters.slice(1);
    const vowel = (ch) => /[aeiouäöüy]/.test(ch);
    const priority = [first, ...rest.filter((ch) => !vowel(ch)), ...rest.filter(vowel)];
    const finger = (ch) => FINGERS[locate(layout, ch).key];
    let chosen = null;
    const pool = priority.slice(1);
    // With the first letter if at all possible; without it only as a last resort.
    for (const withFirst of [true, false]) {
      for (let size = 2; size <= Math.min(4, priority.length) && !chosen; size++) {
        const candidates = withFirst ? combinations(pool, size - 1) : combinations(pool, size);
        for (const combo of candidates) {
          const keys = withFirst ? [first, ...combo] : combo;
          const fingers = new Set(keys.map(finger));
          if (fingers.size !== keys.length) continue;
          const key = chordKey(keys);
          if (used.has(key)) continue;
          chosen = keys;
          used.add(key);
          break;
        }
      }
      if (chosen) break;
    }
    if (chosen) table.push({ word, keys: chosen });
  }
  cache.set(id, table);
  return table;
}

/** The chord levels: growing groups of words, most frequent first, then whole sentences. */
export const CHORD_GROUPS = [
  [0, 10],
  [10, 25],
  [25, 45],
  [45, 70],
  [70, 100],
];
