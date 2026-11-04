// The "Partituren" panel's helpers (web/mn-scores.js).
import { describe, expect, it } from 'vitest';
import { dateOf, fileStamp, freeName, keepVersion, stampOf } from '../web/mn-scores.js';

/** mn.files in memory: upload, list (names directly in a folder), remove. */
function fakeFiles() {
  const files = new Map();
  return {
    files,
    mn: {
      files: {
        upload: async (path, blob) => {
          files.set(path, blob);
        },
        list: async (prefix = '') =>
          [...files.keys()]
            .filter((path) => path.startsWith(`${prefix}/`))
            .map((path) => path.slice(prefix.length + 1))
            .filter((name) => !name.includes('/')),
        remove: async (path) => {
          files.delete(path);
        },
      },
    },
  };
}

describe('version stamps', () => {
  it('turn a date into a file name and back', () => {
    const date = new Date('2026-11-04T10:12:05.123Z');
    expect(stampOf(date)).toBe('2026-11-04T10-12-05-123Z');
    expect(dateOf(`${stampOf(date)}.mscz`)?.getTime()).toBe(date.getTime());
    expect(dateOf('notes.txt')).toBeNull();
  });

  it('name restored versions without locale text', () => {
    expect(fileStamp(new Date(2026, 10, 4, 9, 5))).toBe('2026-11-04 09-05');
  });
});

describe('freeName', () => {
  it('adds a number while the name is taken', () => {
    const taken = new Set(['Lied.mscz', 'Lied (2).mscz']);
    expect(freeName(taken, 'Lied', '.mscz')).toBe('Lied (3).mscz');
    expect(freeName(taken, 'Neu', '.mscz')).toBe('Neu.mscz');
  });
});

describe('keepVersion', () => {
  it('keeps the newest 20 versions of a score', async () => {
    const { files, mn } = fakeFiles();
    for (let i = 0; i < 22; i++) {
      files.set(
        `.versions/Lied.mscz/${stampOf(new Date(Date.UTC(2026, 0, 1, 0, i)))}.mscz`,
        new Blob(),
      );
    }
    await keepVersion(mn, 'Lied.mscz', new Blob(['x']));
    const kept = await mn.files.list('.versions/Lied.mscz');
    expect(kept).toHaveLength(20);
    expect(kept.sort()[0]).toBe(`${stampOf(new Date(Date.UTC(2026, 0, 1, 0, 3)))}.mscz`);
  });

  it('ignores files that are no scores', async () => {
    const { files, mn } = fakeFiles();
    await keepVersion(mn, 'notes.txt', new Blob(['x']));
    expect(files.size).toBe(0);
  });
});
