import { describe, expect, it } from 'vitest';
import { parseManifest } from './index.ts';
import {
  LIBRARY,
  libraryCatalogSchema,
  libraryEntry,
  libraryEntrySchema,
  libraryManifest,
} from './library.ts';

const entry = {
  id: 'demo',
  name: 'Demo',
  description: 'Eine Demo',
  category: 'Werkzeuge',
  website: 'https://example.com',
  image: `docker.io/demo/demo:1.0@sha256:${'a'.repeat(64)}`,
  port: 8080,
  memoryMb: 256,
  healthPath: '/health',
};

describe('app library', () => {
  it('ships a valid catalog with pinned images', () => {
    expect(LIBRARY.length).toBeGreaterThan(0);
    for (const e of LIBRARY) expect(e.image).toMatch(/@sha256:[a-f0-9]{64}$/);
    expect(libraryEntry('jellyfin')?.port).toBe(8096);
    expect(libraryEntry('nope')).toBeUndefined();
  });

  it('applies safe defaults', () => {
    const parsed = libraryEntrySchema.parse(entry);
    expect(parsed.user).toBe('10001:10001');
    expect(parsed.readOnly).toBe(true);
    expect(parsed.volumes).toEqual({});
  });

  it.each([
    ['a tag without digest', { image: 'docker.io/demo/demo:latest' }],
    ['a short digest', { image: 'docker.io/demo/demo@sha256:abc' }],
    ['root', { user: '0:0' }],
    ['a relative volume path', { volumes: { data: 'data' } }],
    ['a volume name with dots', { volumes: { '../x': '/x' } }],
    ['a volume path leaving its folder', { volumes: { data: '/x/../etc' } }],
    ['a multi-line env value', { env: { A: 'x\nB=y' } }],
    ['an env value that expands variables', { env: { A: '${GH_TOKEN}' } }],
    ['an env value with a quote', { env: { A: "it's" } }],
    ['an http website', { website: 'http://example.com' }],
    ['a health path with spaces', { healthPath: '/a b' }],
    ['unknown fields', { privileged: true }],
  ])('rejects %s', (_, change) => {
    expect(libraryEntrySchema.safeParse({ ...entry, ...change }).success).toBe(false);
  });

  it('rejects duplicate ids', () => {
    expect(libraryCatalogSchema.safeParse({ entries: [entry, entry] }).success).toBe(false);
  });

  it('registers an installed entry as a valid container manifest', () => {
    const jellyfin = libraryEntry('jellyfin');
    if (!jellyfin) throw new Error('jellyfin missing');
    const result = parseManifest(libraryManifest(jellyfin, 'kino'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest).toMatchObject({
      slug: 'kino',
      kind: 'container',
      target: 'nucbox',
      library: 'jellyfin',
      container: { port: 8096 },
    });
  });
});
