import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip.ts';

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  const hasUnzip = spawnSync('unzip', ['-v']).status === 0;

  it.skipIf(!hasUnzip)('writes an archive that unzip reads back, with folders and umlauts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    try {
      const archive = join(dir, 'start.zip');
      writeFileSync(
        archive,
        zip([
          { path: 'public/_mininode/ui.css', content: 'body{}' },
          { path: 'i18n/de.json', content: '{"app.title":"Bücher"}' },
        ]),
      );
      execFileSync('unzip', ['-q', archive, '-d', join(dir, 'out')]);
      expect(readFileSync(join(dir, 'out/i18n/de.json'), 'utf8')).toBe('{"app.title":"Bücher"}');
      expect(readFileSync(join(dir, 'out/public/_mininode/ui.css'), 'utf8')).toBe('body{}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
