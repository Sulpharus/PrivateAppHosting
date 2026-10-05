import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { readableRow } from './create.ts';
import {
  BACKUP_FORMAT,
  type BackupManifest,
  decodeObjectPath,
  encodeObjectPath,
  sha256File,
} from './manifest.ts';
import { connectionEnv } from './pg.ts';
import { inParallel, listObjects } from './storage.ts';
import { verifyBackup } from './verify.ts';

describe('object paths on disk', () => {
  it('round-trips awkward names and keeps folders', () => {
    for (const name of [
      'app/user-1/photo one.jpg',
      'a/b:c?d*e.txt',
      'dots/../x',
      'ünï/ß.txt',
      'trailing./dot',
      '100%/real',
    ]) {
      const encoded = encodeObjectPath(name);
      expect(encoded).not.toMatch(/[:?*<>|"\\]/);
      expect(encoded.split('/').every((s) => s !== '.' && s !== '..')).toBe(true);
      expect(decodeObjectPath(encoded)).toBe(name);
    }
    expect(encodeObjectPath('a/b c.jpg')).toBe('a/b%20c.jpg');
  });
});

describe('readable settings', () => {
  it('leave out keys and hashes', () => {
    expect(
      readableRow({
        id: 'openai',
        name: 'OpenAI',
        key_enc: 'xyz',
        key_hint: '1234',
        encrypted_password: 'h',
        refresh_token: 't',
      }),
    ).toEqual({ id: 'openai', name: 'OpenAI', key_hint: '1234' });
  });
});

describe('connection', () => {
  it('passes the password in the environment, not in the arguments', () => {
    expect(
      connectionEnv(
        'postgresql://postgres.abc:p%40ss@db.example.com:5432/postgres?sslmode=require',
      ),
    ).toMatchObject({
      PGHOST: 'db.example.com',
      PGPORT: '5432',
      PGUSER: 'postgres.abc',
      PGPASSWORD: 'p@ss',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require',
    });
  });
});

describe('verify', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  async function folder(): Promise<{ dir: string; manifest: BackupManifest }> {
    const dir = mkdtempSync(join(tmpdir(), 'mn-verify-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'database'));
    writeFileSync(join(dir, 'database', 'data.dump'), 'rows');
    const { sha256, bytes } = await sha256File(join(dir, 'database', 'data.dump'));
    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      createdAt: '2026-10-05T00:00:00Z',
      commit: null,
      database: { serverVersion: '17.0', migrations: [], schemas: [], tables: [] },
      storage: { included: false, buckets: [] },
      files: [{ path: 'database/data.dump', bytes, sha256 }],
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
    return { dir, manifest };
  }

  it('accepts an intact folder', async () => {
    const { dir } = await folder();
    expect((await verifyBackup(dir)).problems).toEqual([]);
  });

  it('finds changed, missing and extra files', async () => {
    const { dir } = await folder();
    writeFileSync(join(dir, 'database', 'data.dump'), 'rowz');
    writeFileSync(join(dir, 'stray.txt'), 'x');
    const changed = (await verifyBackup(dir)).problems;
    expect(changed).toContain('changed: database/data.dump');
    expect(changed).toContain('not in the manifest: stray.txt');
    rmSync(join(dir, 'database', 'data.dump'));
    expect((await verifyBackup(dir)).problems).toContain('missing: database/data.dump');
  });

  it('says so when it is not a backup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mn-verify-'));
    dirs.push(dir);
    expect((await verifyBackup(dir)).problems[0]).toMatch(/not a backup folder/);
  });
});

describe('storage walk', () => {
  it('descends into folders and pages', async () => {
    const tree: Record<string, { name: string; id: string | null; metadata?: object }[]> = {
      '': [
        { name: 'a', id: null },
        { name: 'root.txt', id: '1', metadata: { size: 3, mimetype: 'text/plain' } },
      ],
      a: [
        { name: 'b', id: null },
        { name: 'one.jpg', id: '2', metadata: { size: 10 } },
      ],
      'a/b': [{ name: 'deep.png', id: '3', metadata: { size: 5, mimetype: 'image/png' } }],
    };
    const client = {
      storage: {
        from: () => ({
          list: async (folder: string) => ({ data: tree[folder] ?? [], error: null }),
        }),
      },
    } as unknown as SupabaseClient;
    const found = await listObjects(client, 'app-files');
    expect(found.map((o) => o.name)).toEqual(['a/b/deep.png', 'a/one.jpg', 'root.txt']);
    expect(found.find((o) => o.name === 'root.txt')).toMatchObject({
      bytes: 3,
      contentType: 'text/plain',
    });
  });
});

describe('inParallel', () => {
  it('never runs more than the limit and stops at the first failure', async () => {
    let running = 0;
    let peak = 0;
    await inParallel([1, 2, 3, 4, 5, 6], 2, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(2);
    const seen: number[] = [];
    await expect(
      inParallel([1, 2, 3, 4, 5], 1, async (n) => {
        seen.push(n);
        if (n === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(seen).toEqual([1, 2]);
  });
});
