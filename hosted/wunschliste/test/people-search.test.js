import { describe, expect, it } from 'vitest';
import { looksLikeEmail, normalize, searchPeople } from '../people-search.js';

const people = [
  { id: '1', name: 'José García' },
  { id: '2', name: 'Anna Müller' },
  { id: '3', name: 'Johanna Groß' },
  { id: '4', name: 'Tom' },
  { id: '5', name: 'Annabell Schmidt' },
];
const names = (query) => searchPeople(people, query).map((p) => p.name);

describe('searchPeople', () => {
  it('finds parts of names in any order, without accents or case', () => {
    expect(names('jose')).toEqual(['José García']);
    expect(names('garcia jose')).toEqual(['José García']);
    expect(names('MÜLLER')).toEqual(['Anna Müller']);
    expect(names('gross')).toEqual(['Johanna Groß']);
  });

  it('puts whole words before beginnings and inner parts', () => {
    expect(names('anna')).toEqual(['Anna Müller', 'Annabell Schmidt', 'Johanna Groß']);
  });

  it('forgives a typo in a longer word, and knows initials', () => {
    expect(names('mueller')).toEqual(['Anna Müller']);
    expect(names('mülller')).toEqual(['Anna Müller']);
    expect(names('jg')).toEqual(['Johanna Groß', 'José García']);
  });

  it('finds nothing for nothing, and stops at the limit', () => {
    expect(names('   ')).toEqual([]);
    expect(names('xyz')).toEqual([]);
    expect(searchPeople(people, 'a', 2)).toHaveLength(2);
  });
});

describe('helpers', () => {
  it('recognises addresses and cleans text', () => {
    expect(looksLikeEmail(' tom@example.com ')).toBe(true);
    expect(looksLikeEmail('tom@example')).toBe(false);
    expect(looksLikeEmail('Tom Meier')).toBe(false);
    expect(normalize('  Ärger  ß ')).toBe('arger ss');
  });
});
