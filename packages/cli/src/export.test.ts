import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportApp, instanceIdentifiers, MARKER, scanText } from './export.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const ACCOUNT = '0123456789abcdef0123456789abcdef';

/** A throwaway git repository with one hosted app, its files committed. */
function repo(
  files: Record<string, string | Buffer>,
  links: Record<string, string> = {},
): { root: string; app: string } {
  const root = mkdtempSync(join(tmpdir(), 'mn-export-'));
  dirs.push(root);
  const app = join(root, 'hosted/demo');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(app, name, '..'), { recursive: true });
    writeFileSync(join(app, name), content);
  }
  for (const [name, target] of Object.entries(links)) symlinkSync(target, join(app, name));
  mkdirSync(join(root, '.github/workflows'), { recursive: true });
  writeFileSync(
    join(root, '.github/workflows/deploy.yml'),
    `  CLOUDFLARE_ACCOUNT_ID: ${ACCOUNT}\n  SUPABASE_PROJECT_REF: \${{ x && 'abcdefghijklmnopqrst' || 'tsrqponmlkjihgfedcba' }}\n`,
  );
  writeFileSync(join(root, '.env.local'), 'DB_PASSWORD=hunter2-very-private');
  const git = (...args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('add', '-A', '--', 'hosted', '.github');
  git('-c', 'user.name=Owner Person', '-c', 'user.email=owner@private.test', 'commit', '-qm', 'i');
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

const rules = (result: ReturnType<typeof exportApp>) =>
  result.findings.map((f) => `${f.file}:${f.line} ${f.rule}`);

describe('mininode export', () => {
  it('finds the identifiers of a repository', () => {
    const { root } = repo({ 'mininode.json': manifest });
    expect(instanceIdentifiers(root).sort()).toEqual(
      [
        ACCOUNT,
        'Owner Person',
        'abcdefghijklmnopqrst',
        'owner@private.test',
        'tsrqponmlkjihgfedcba',
      ].sort(),
    );
  });

  it('finds the Cloudflare account and both Supabase projects of this repository', () => {
    const ids = instanceIdentifiers(ROOT);
    const deploy = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const account = /CLOUDFLARE_ACCOUNT_ID:\s*([a-f0-9]{32})/.exec(deploy)?.[1];
    expect(account).toBeDefined();
    expect(ids).toContain(account);
    for (const ref of deploy.match(/'[a-z]{20}'/g) ?? []) expect(ids).toContain(ref.slice(1, -1));
  });

  it('refuses to run when the instance settings cannot be found', () => {
    const { root } = repo({ 'mininode.json': manifest });
    writeFileSync(join(root, '.github/workflows/deploy.yml'), 'jobs: {}\n');
    expect(() => instanceIdentifiers(root)).toThrow('refusing to export');
  });

  it.each([
    ['private key', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    ['Supabase secret key', 'const k = "sb_secret_abcdefghijklmnop";'],
    ['Anthropic key', 'sk-ant-api03-abcdefghijklmnop'],
    ['GitHub token', `ghp_${'a'.repeat(36)}`],
    ['JSON Web Token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig'],
    ['Supabase project URL', 'https://abcdefghijklmnopqrst.supabase.co'],
    ['email address jane@private.test', 'contact: jane@private.test'],
    ['email address 123+jane@users.noreply.github.com', '123+jane@users.noreply.github.com'],
  ])('reports a %s', (rule, line) => {
    expect(scanText('a.js', `ok\n${line}\n`, []).map((f) => f.rule)).toContain(rule);
  });

  it('accepts example addresses and ordinary code', () => {
    expect(scanText('a.js', 'mail("lena@example.com"); const x = 1;', [])).toEqual([]);
  });

  it('exports the committed files only and adds the guide and marker', () => {
    const { root, app } = repo({
      'mininode.json': manifest,
      'index.html': '<h1>Demo</h1>',
      'db/0001_init.sql': 'create table app_demo.items (id uuid);',
      'icon.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
    });
    writeFileSync(join(app, 'untracked.txt'), 'local notes');
    writeFileSync(join(app, 'index.html'), '<h1>Uncommitted edit</h1>');
    const out = join(root, 'out');
    const result = exportApp(root, app, out);
    expect(result.findings).toEqual([]);
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toBe('<h1>Demo</h1>');
    expect(existsSync(join(out, 'untracked.txt'))).toBe(false);
    expect(existsSync(join(out, 'icon.png'))).toBe(true);
    expect(readFileSync(join(out, 'MININODE.md'), 'utf8')).toContain('never rows');
    expect(readFileSync(join(out, MARKER), 'utf8')).toBe('slug=demo\n');
  });

  it('never ships .env files and stops on instance identifiers and author names', () => {
    const { root, app } = repo({
      'mininode.json': manifest,
      '.env': 'SECRET=1',
      'app.js': `const account = "${ACCOUNT}";\n// owner@private.test\n// © Owner Person`,
    });
    const out = join(root, 'out');
    const result = exportApp(root, app, out);
    expect(result.files).not.toContain('.env');
    expect(rules(result)).toEqual([
      'app.js:1 identifier of this instance',
      'app.js:2 identifier of this instance',
      'app.js:3 identifier of this instance',
    ]);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses symlinks, so nothing outside the app can be pulled in', () => {
    const { root, app } = repo({ 'mininode.json': manifest }, { 'config.txt': '../../.env.local' });
    const result = exportApp(root, app, join(root, 'out'));
    expect(rules(result)).toEqual(['config.txt:0 symbolic link (only plain files are exported)']);
  });

  it('refuses data files and unknown binaries, and scans allowed binaries for keys', () => {
    const { root, app } = repo({
      'mininode.json': manifest,
      'backup.db': 'rows',
      'export.csv': 'name;amount',
      'data.bin': Buffer.concat([Buffer.from([0]), Buffer.from(`ghp_${'a'.repeat(36)}`)]),
      'logo.png': Buffer.concat([Buffer.from([0]), Buffer.from(`sb_secret_${'b'.repeat(20)}`)]),
      'photo.jpg': Buffer.concat([Buffer.from([0xff, 0xd8, 0, 0]), Buffer.from('Exif\0\0')]),
    });
    const result = exportApp(root, app, join(root, 'out'));
    expect(rules(result).sort()).toEqual(
      [
        'backup.db:0 data file (exports carry code, never data)',
        'data.bin:0 binary file (only images and fonts are exported)',
        'export.csv:0 data file (exports carry code, never data)',
        'logo.png:1 Supabase secret key',
        'photo.jpg:0 image metadata (EXIF, may hold place and camera); strip it',
      ].sort(),
    );
  });

  it('refuses library programs', () => {
    const library = JSON.stringify({
      ...JSON.parse(manifest),
      kind: 'container',
      target: 'nucbox',
      container: { port: 80 },
      library: 'jellyfin',
    });
    const { root, app } = repo({ 'mininode.json': library });
    expect(() => exportApp(root, app, join(root, 'out'))).toThrow('library programs');
  });

  it('never writes into the repository, the app or an unrelated folder', () => {
    const { root, app } = repo({ 'mininode.json': manifest });
    expect(() => exportApp(root, app, root)).toThrow('refusing');
    expect(() => exportApp(root, app, app)).toThrow('refusing');
    expect(() => exportApp(root, app, join(app, 'out'))).toThrow('refusing');
    const other = join(root, 'notes');
    mkdirSync(other);
    writeFileSync(join(other, 'keep.txt'), 'mine');
    expect(() => exportApp(root, app, other)).toThrow('not an earlier export');
    expect(readFileSync(join(other, 'keep.txt'), 'utf8')).toBe('mine');
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
