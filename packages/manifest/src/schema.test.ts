import { describe, expect, it } from 'vitest';
import {
  ALL_GOOGLE_SCOPES,
  appSchemaName,
  googleConnectSrc,
  googleScopes,
  isAllowedApiBase,
  parseManifest,
} from './index.ts';

const spa = {
  specVersion: 1,
  slug: 'rezepte',
  name: 'Rezepte',
  description: 'Rezepte und Wochenplan',
  kind: 'spa',
  target: 'cloudflare',
  data: { mode: 'private' },
  build: { command: 'pnpm build', output: 'dist' },
};

describe('parseManifest', () => {
  it('accepts a minimal SPA and applies defaults', () => {
    const result = parseManifest(spa);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.access).toEqual({ default: false, roles: ['user', 'trusted', 'admin'] });
  });

  it.each([
    ['uppercase', 'Rezepte'],
    ['reserved', 'admin'],
    ['double dash', 'a--b'],
    ['trailing dash', 'abc-'],
    ['too short', 'a'],
  ])('rejects a %s slug', (_, slug) => {
    expect(parseManifest({ ...spa, slug }).ok).toBe(false);
  });

  it('rejects a kind that cannot run on the target', () => {
    const result = parseManifest({ ...spa, target: 'nucbox' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join()).toContain('cannot run on target');
  });

  it('requires a container block for container apps', () => {
    const result = parseManifest({ ...spa, kind: 'container', target: 'nucbox', build: undefined });
    expect(result.ok).toBe(false);
  });

  it('requires an installer or winget id for Windows remote apps', () => {
    const base = { ...spa, kind: 'remote', target: 'remote', build: undefined };
    expect(parseManifest({ ...base, remote: { runtime: 'windows', program: 'foo.exe' } }).ok).toBe(
      false,
    );
    expect(
      parseManifest({
        ...base,
        remote: { runtime: 'windows', program: 'foo.exe', wingetId: 'Foo.Foo' },
      }).ok,
    ).toBe(true);
  });

  it('rejects unknown keys so typos surface early', () => {
    expect(parseManifest({ ...spa, dta: {} }).ok).toBe(false);
  });

  it('rejects build outputs escaping the app folder', () => {
    expect(parseManifest({ ...spa, build: { output: '../x' } }).ok).toBe(false);
  });

  it('requires the trusted role for shared-account apps', () => {
    const result = parseManifest({
      ...spa,
      data: { mode: 'shared-account' },
      access: { roles: ['user'] },
    });
    expect(result.ok).toBe(false);
  });
});

describe('appSchemaName', () => {
  it('maps dashes to underscores', () => {
    expect(appSchemaName('habit-tracker')).toBe('app_habit_tracker');
  });
});

describe('google', () => {
  it('maps services and access levels to scopes and API origins', () => {
    const result = parseManifest({ ...spa, google: { gmail: 'write', calendar: 'read' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(googleScopes(result.manifest.google)).toEqual([
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]);
    expect(googleConnectSrc(result.manifest.google)).toEqual([
      'https://gmail.googleapis.com',
      'https://www.googleapis.com',
    ]);
    for (const scope of googleScopes(result.manifest.google))
      expect(ALL_GOOGLE_SCOPES).toContain(scope);
  });

  it('rejects an empty or unknown google block', () => {
    expect(parseManifest({ ...spa, google: {} }).ok).toBe(false);
    expect(parseManifest({ ...spa, google: { drive: 'read' } }).ok).toBe(false);
    expect(parseManifest({ ...spa, google: { gmail: 'admin' } }).ok).toBe(false);
  });

  it('apps without a google block get no scopes', () => {
    expect(googleScopes(undefined)).toEqual([]);
    expect(googleConnectSrc(undefined)).toEqual([]);
  });
});

describe('game', () => {
  it('accepts a game block and fills defaults', () => {
    const result = parseManifest({
      ...spa,
      game: { genre: 'puzzle', stats: [{ id: 'moves', label: 'Züge', better: 'lower' }] },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.game?.players).toBe('solo');
      expect(result.manifest.game?.stats[0]?.format).toBe('number');
      expect(result.manifest.game?.stats[0]?.min).toBe(0);
    }
  });

  it('rejects unknown genres, bad stat ids and duplicates', () => {
    expect(parseManifest({ ...spa, game: { genre: 'shooter' } }).ok).toBe(false);
    expect(
      parseManifest({ ...spa, game: { genre: 'quiz', stats: [{ id: 'Punkte', label: 'x' }] } }).ok,
    ).toBe(false);
    const stat = { id: 'score', label: 'Punkte' };
    expect(parseManifest({ ...spa, game: { genre: 'quiz', stats: [stat, stat] } }).ok).toBe(false);
  });
});

describe('apis', () => {
  const weather = {
    id: 'openweathermap',
    name: 'OpenWeatherMap',
    baseUrl: 'https://api.openweathermap.org/data/2.5',
    auth: { type: 'query', param: 'appid' },
    docs: 'https://openweathermap.org/api',
    reason: 'Wetter für die Wochenansicht',
  };

  it('accepts declared APIs with header, bearer or query keys', () => {
    const result = parseManifest({
      ...spa,
      apis: [
        weather,
        { ...weather, id: 'tmdb', auth: { type: 'bearer' } },
        {
          ...weather,
          id: 'deepl',
          auth: { type: 'header', name: 'Authorization', prefix: 'DeepL-Auth-Key ' },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('accepts keyless APIs without a key placement', () => {
    expect(parseManifest({ ...spa, apis: [{ ...weather, auth: { type: 'none' } }] }).ok).toBe(true);
    expect(
      parseManifest({ ...spa, apis: [{ ...weather, auth: { type: 'none', param: 'key' } }] }).ok,
    ).toBe(false);
  });

  it('rejects duplicate ids and unknown auth types', () => {
    expect(parseManifest({ ...spa, apis: [weather, weather] }).ok).toBe(false);
    expect(parseManifest({ ...spa, apis: [{ ...weather, auth: { type: 'cookie' } }] }).ok).toBe(
      false,
    );
    for (const auth of [
      { type: 'header', name: 'Cookie' },
      { type: 'header', name: 'host' },
      { type: 'header', name: 'X-Key', prefix: 'a\nb' },
    ])
      expect(parseManifest({ ...spa, apis: [{ ...weather, auth }] }).ok, JSON.stringify(auth)).toBe(
        false,
      );
  });

  it('allows only public https hosts as base', () => {
    expect(isAllowedApiBase('https://api.example.com/v1')).toBe(true);
    for (const bad of [
      'http://api.example.com',
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://[::1]/x',
      'https://api.mininode.app/x',
      'https://abc.supabase.co',
      'https://api.mininode.app./x',
      'https://abc.supabase.co.',
      'https://evil.workers.dev',
      'https://user:pw@api.example.com',
      'https://api.example.com/?key=1',
      'not a url',
    ])
      expect(isAllowedApiBase(bad), bad).toBe(false);
  });
});
