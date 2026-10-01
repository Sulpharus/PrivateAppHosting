import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportApp, instanceIdentifiers, scanText } from './export.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway git repository with one hosted app, its files committed. */
function repo(files: Record<string, string>): { root: string; app: string } {
  const root = mkdtempSync(join(tmpdir(), 'mn-export-'));
  dirs.push(root);
  const app = join(root, 'hosted/demo');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(app, name, '..'), { recursive: true });
    writeFileSync(join(app, name), content);
  }
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(
    join(root, '.github/workflows/deploy.yml'),
    "  CLOUDFLARE_ACCOUNT_ID: 0123456789abcdef0123456789abcdef\n  SUPABASE_PROJECT_REF: ${{ x && 'abcdefghijklmnopqrst' || 'tsrqponmlkjihgfedcba' }}\n",
  );
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A');
  git('-c', 'user.name=Owner', '-c', 'user.email=owner@private.test', 'commit', '-qm', 'init');
  return { root, app };
}

const manifest = JSON.stringify({
  specVersion: 1,
  slug: 'demo',
  name: 'Demo',
  description: 'Eine Demo',
  kind: 'static',
  target: 'cloudflare',
});

describe('mininode export', () => {
  it('finds the identifiers of this instance', () => {
    const { root } = repo({ 'mininode.json': manifest });
    expect(instanceIdentifiers(root).sort()).toEqual(
      [
        '0123456789abcdef0123456789abcdef',
        'abcdefghijklmnopqrst',
        'owner@private.test',
        'tsrqponmlkjihgfedcba',
      ].sort(),
    );
  });

  it.each([
    ['private key', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['Supabase secret key', 'const k = "sb_secret_abcdefghijklmnop";'],
    ['Anthropic key', 'sk-ant-api03-abcdefghijklmnop'],
    ['GitHub token', `ghp_${'a'.repeat(36)}`],
    ['JSON Web Token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig'],
    ['Supabase project URL', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['email address jane@private.test', 'contact: jane@private.test'],
  ])('reports a %s', (rule, line) => {
    expect(scanText('a.js', `ok\n${line}\n`, []).map((f) => f.rule)).toContain(rule);
  });

  it('accepts example addresses and ordinary code', () => {
    expect(scanText('a.js', 'mail("lena@example.com"); const x = 1;', [])).toEqual([]);
  });

  it('copies tracked files only and adds the install guide', () => {
    const { root, app } = repo({
      'mininode.json': manifest,
      'index.html': '<h1>Demo</h1>',
      'db/0001_init.sql': 'create table app_demo.items (id uuid);',
    });
    writeFileSync(join(app, 'untracked.txt'), 'local notes');
    const out = join(root, 'out');
    const result = exportApp(root, app, out);
    expect(result.findings).toEqual([]);
    expect(existsSync(join(out, 'index.html'))).toBe(true);
    expect(existsSync(join(out, 'untracked.txt'))).toBe(false);
    expect(readFileSync(join(out, 'MININODE.md'), 'utf8')).toContain('hosted/demo/');
    expect(readFileSync(join(out, 'MININODE.md'), 'utf8')).toContain('never rows');
  });

  it('never ships .env files and stops on instance identifiers', () => {
    const { root, app } = repo({
      'mininode.json': manifest,
      '.env': 'SECRET=1',
      'app.js': 'const account = "0123456789abcdef0123456789abcdef";\n// owner@private.test',
    });
    const out = join(root, 'out');
    const result = exportApp(root, app, out);
    expect(result.files).not.toContain('.env');
    expect(result.findings.map((f) => `${f.file}:${f.line} ${f.rule}`)).toEqual([
      'app.js:1 identifier of this instance',
      'app.js:2 identifier of this instance',
    ]);
    expect(existsSync(out)).toBe(false);
  });

  it('exports every hosted app of this repository without findings', () => {
    const hosted = spawnSync('git', ['ls-files', 'hosted/*/mininode.json'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter(Boolean);
    expect(hosted.length).toBeGreaterThan(0);
    for (const file of hosted) {
      const out = mkdtempSync(join(tmpdir(), 'mn-export-out-'));
      dirs.push(out);
      const result = exportApp(ROOT, join(ROOT, file, '..'), out);
      expect(result.findings, file).toEqual([]);
    }
  });
});
