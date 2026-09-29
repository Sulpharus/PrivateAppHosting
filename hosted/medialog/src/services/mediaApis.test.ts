import { beforeEach, describe, expect, it, vi } from 'vitest';

// The SDK is replaced by a fake whose APIs answer from the tables below.
const calls: { id: string; path: string }[] = [];
const answers: Record<string, (path: string) => unknown> = {};
vi.mock('./mininode', () => ({
  ExternalApiError: class extends Error {},
  toJson: (v: unknown) => JSON.parse(JSON.stringify(v)),
  mininode: async () => ({
    kv: {
      get: async () => null,
      set: async () => undefined,
      list: async () => [],
      delete: async () => undefined,
    },
    api: (id: string) => ({
      fetch: async (path: string) => {
        calls.push({ id, path });
        return Response.json(answers[id]?.(path) ?? {});
      },
      json: async (path: string) => {
        calls.push({ id, path });
        return answers[id]?.(path) ?? {};
      },
    }),
  }),
}));

const { searchMediaApis } = await import('./mediaApis.ts');
const { setCurrentSettings } = await import('./settings.ts');

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(answers)) delete answers[key];
  vi.stubGlobal('navigator', { onLine: true });
});

describe('German titles in the online search', () => {
  it('asks Google Books for German editions and keeps the German query', async () => {
    setCurrentSettings({ accent: 'blue', preferGermanTitles: true });
    answers['google-books'] = (path) =>
      path.includes('langRestrict=de')
        ? {
            items: [
              {
                id: 'de1',
                volumeInfo: {
                  title: 'Der Herr der Ringe',
                  language: 'de',
                  authors: ['J. R. R. Tolkien'],
                },
              },
            ],
          }
        : {
            items: [
              {
                id: 'en1',
                volumeInfo: {
                  title: 'The Lord of the Rings',
                  language: 'en',
                  authors: ['J. R. R. Tolkien'],
                },
              },
            ],
          };
    const res = await searchMediaApis('Der Herr der Ringe', 'book', {
      category: 'book',
      sortBy: 'relevance',
    });
    const books = calls
      .filter((c) => c.id === 'google-books')
      .map((c) => decodeURIComponent(c.path));
    expect(
      books.some((p) => p.includes('langRestrict=de') && p.includes('q=Der+Herr+der+Ringe')),
    ).toBe(true);
    expect(res.results.map((r) => r.title)).toContain('Der Herr der Ringe');
    // Manga/anime databases are English-indexed: they get the translation.
    expect(calls.find((c) => c.id === 'jikan')?.path).toContain('The%20Lord%20of%20the%20Rings');
  });

  it('shows the German title of a manga and keeps the English one', async () => {
    setCurrentSettings({ accent: 'blue', preferGermanTitles: true });
    answers.jikan = () => ({
      data: [
        {
          mal_id: 1,
          title: 'Shingeki no Kyojin',
          title_english: 'Attack on Titan',
          titles: [{ type: 'German', title: 'Angriff auf Titan' }],
          type: 'Manga',
        },
      ],
    });
    const res = await searchMediaApis('Attack on Titan', 'book', {
      category: 'book',
      sortBy: 'relevance',
    });
    const hit = res.results.find((r) => r.sourceApi === 'jikan');
    expect(hit?.title).toBe('Angriff auf Titan');
    expect(hit?.englishTitle).toBe('Attack on Titan');
  });

  it('can be switched off', async () => {
    setCurrentSettings({ accent: 'blue', preferGermanTitles: false });
    await searchMediaApis('Der Herr der Ringe', 'book', { category: 'book', sortBy: 'relevance' });
    expect(
      calls.filter((c) => c.id === 'google-books').every((c) => !c.path.includes('langRestrict')),
    ).toBe(true);
  });

  it('never invents achievements or page counts', async () => {
    setCurrentSettings({ accent: 'blue', preferGermanTitles: true });
    answers.steam = () => ({ items: [{ id: 42, name: 'Hollow Knight', type: 'app' }] });
    const res = await searchMediaApis('Hollow Knight', 'game', {
      category: 'game',
      sortBy: 'relevance',
    });
    const game = res.results.find((r) => r.sourceApi === 'steam');
    expect(game?.achievements ?? []).toEqual([]);
  });
});
