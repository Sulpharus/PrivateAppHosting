import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKUP_FORMAT, type BackupManifest } from './manifest.ts';
import type { Runner } from './pg.ts';
import { countCheckSql, preflightSql, restoreDatabase } from './restore.ts';

const manifest: BackupManifest = {
  format: BACKUP_FORMAT,
  createdAt: '2026-10-05T00:00:00Z',
  commit: null,
  database: {
    serverVersion: '17.0',
    migrations: [],
    schemas: ['platform', 'auth'],
    tables: [
      { schema: 'platform', table: 'apps', rows: 3 },
      { schema: 'auth', table: 'users', rows: 2 },
    ],
  },
  storage: { included: false, buckets: [] },
  files: [],
};

describe('generated SQL', () => {
  it('checks privileges and the trigger switch before anything is emptied', () => {
    const sql = preflightSql(manifest);
    expect(sql).toContain("session_replication_role') <> 'replica'");
    expect(sql).toContain(`'"platform"."apps"'`);
    expect(sql).toContain(`'"auth"."users"'`);
  });

  it('compares every table with the backup before the commit', () => {
    const sql = countCheckSql(manifest);
    expect(sql).toContain('<> 3');
    expect(sql).toContain('<> 2');
  });
});

// A fake pg_restore / psql: what matters is which statements psql is given at the end.
function fakeRunner(restoreExit: number): { runner: Runner; sent: () => string } {
  let sent = '';
  const runner: Runner = {
    kind: 'local',
    start(tool) {
      const child = new EventEmitter() as EventEmitter & {
        stdin: Writable;
        stdout: Readable | null;
        kill: () => boolean;
      };
      child.kill = () => true;
      if (tool === 'pg_restore') {
        child.stdin = new Writable({ write: (_c, _e, done) => done() });
        const out = new PassThrough();
        child.stdout = out;
        child.stdin.on('finish', () => {
          out.write('COPY platform.apps FROM stdin;\n');
          out.end();
          setTimeout(() => child.emit('close', restoreExit), 5);
        });
      } else {
        child.stdout = Readable.from([]);
        child.stdin = new Writable({
          write(chunk, _e, done) {
            sent += chunk.toString();
            done();
          },
          final(done) {
            child.emit('close', 0);
            done();
          },
        });
      }
      return child as never;
    },
  };
  return { runner, sent: () => sent };
}

describe('restoreDatabase', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const folder = () => {
    const dir = mkdtempSync(join(tmpdir(), 'mn-restore-'));
    dirs.push(dir);
    // restoreDatabase reads database/data.dump; its content does not matter to the fake tool.
    mkdirSync(join(dir, 'database'));
    writeFileSync(join(dir, 'database', 'data.dump'), 'dump');
    return dir;
  };

  it('rolls back, never commits, when pg_restore fails', async () => {
    const { runner, sent } = fakeRunner(1);
    await expect(
      restoreDatabase(folder(), manifest, 'postgresql://u:p@127.0.0.1:1/db', () => {}, runner),
    ).rejects.toThrow(/pg_restore stopped with exit code 1/);
    expect(sent()).toContain('rollback;');
    expect(sent()).not.toContain('commit;');
  });

  it('commits after the count check when everything went well', async () => {
    const { runner, sent } = fakeRunner(0);
    await restoreDatabase(folder(), manifest, 'postgresql://u:p@127.0.0.1:1/db', () => {}, runner);
    expect(sent().indexOf('<> 3')).toBeLessThan(sent().indexOf('commit;'));
    expect(sent()).not.toContain('rollback;');
  });
});
