// Finding people for a wishlist's whitelist by what one remembers of them: parts of the name in
// any order, without accents or case ("jose" finds "José García"), initials ("jg"), and a typo
// per longer word ("Mülller"). An e-mail address is looked up exactly on the server
// (find_person), which never hands out addresses. Pure; tests in test/people-search.test.js.

/** Lower case, without accents, ß as ss, only letters, digits and spaces. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9@.+_-]+/g, ' ')
    .trim();
}

/** Whether the text looks like an e-mail address (then it is looked up on the server). */
export const looksLikeEmail = (text) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(text).trim());

/** Edit distance, capped: anything above `max` is `max + 1`. */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      best = Math.min(best, current[j]);
    }
    if (best > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/** How well one query word fits a name's words: 0 (not at all) to 4 (a whole word). */
function wordScore(word, nameWords) {
  let best = 0;
  for (const part of nameWords) {
    if (part === word) return 4;
    if (part.startsWith(word)) best = Math.max(best, 3);
    else if (word.length >= 3 && part.includes(word)) best = Math.max(best, 2);
    else if (word.length >= 4 && distance(word, part.slice(0, word.length + 1), 1) <= 1)
      best = Math.max(best, 1);
  }
  return best;
}

/**
 * The people that fit the query, best first: every query word has to fit a word of the name, or
 * the query is the initials. `people`: `{ id, name }[]`. At most `limit`.
 */
export function searchPeople(people, query, limit = 8) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const results = [];
  for (const person of people) {
    const nameWords = normalize(person.name).split(' ').filter(Boolean);
    if (nameWords.length === 0) continue;
    const initials = nameWords.map((w) => w[0]).join('');
    let score = 0;
    const scores = words.map((word) => wordScore(word, nameWords));
    if (scores.every((s) => s > 0)) score = scores.reduce((a, b) => a + b, 0);
    else if (words.length === 1 && words[0].length >= 2 && initials.startsWith(words[0])) score = 1;
    if (score > 0) results.push({ person, score });
  }
  return results
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.person.name.localeCompare(b.person.name, 'de', { sensitivity: 'base' }),
    )
    .slice(0, limit)
    .map((result) => result.person);
}
