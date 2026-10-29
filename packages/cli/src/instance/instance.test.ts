import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildConfig } from './init.ts';
import { loadInstanceConfig } from './load.ts';
import { configureInstance, environmentVariables, setJsonString, setTomlValue } from './render.ts';

const REPO = resolve(import.meta.dirname, '../../../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const answers = {
  domain: 'apps.example.org',
  zone: 'example.org',
  accountId: '0123456789abcdef0123456789abcdef',
  supabaseRef: 'abcdefghijklmnopqrst',
  publishableKey: 'sb_publishable_0123456789abcdef',
  repository: 'someone/platform',
};

/** A scratch copy of the files `configure` rewrites. */
function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'mininode-configure-'));
  dirs.push(root);
  for (const file of [
    'apps/portal/wrangler.jsonc',
    'apps/api/wrangler.jsonc',
    'apps/ai-proxy/wrangler.jsonc',
    'supabase/config.toml',
  ]) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    cpSync(join(REPO, file), join(root, file));
  }
  return root;
}

describe('configure', () => {
  it('writes the domain, project and account into every file that cannot read the config', () => {
    const root = scratch();
    const { changed } = configureInstance(root, buildConfig(answers));
    expect(changed).toHaveLength(4);
    const portal = readFileSync(join(root, 'apps/portal/wrangler.jsonc'), 'utf8');
    expect(portal).toContain('"pattern": "apps.example.org"');
    expect(portal).toContain('"COOKIE_DOMAIN": ".apps.example.org"');
    expect(portal).toContain('"API_URL": "https://api.apps.example.org"');
    const api = readFileSync(join(root, 'apps/api/wrangler.jsonc'), 'utf8');
    expect(api).toContain('"GITHUB_REPO": "someone/platform"');
    expect(api).toContain('"MAIL_FROM": "hallo@apps.example.org"');
    expect(api).toContain('"NUCBOX_CONTROL_URL": "https://control.apps.example.org"');
    const ai = readFileSync(join(root, 'apps/ai-proxy/wrangler.jsonc'), 'utf8');
    expect(ai).toContain('gateway.ai.cloudflare.com/v1/0123456789abcdef0123456789abcdef/mininode');
    const toml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
    expect(toml).toContain('project_id = "abcdefghijklmnopqrst"');
    expect(toml).toContain('rp_id = "apps.example.org"');
    expect(toml).toContain(
      'additional_redirect_urls = ["https://apps.example.org/**", "https://*.apps.example.org/**"]',
    );
  });

  it('leaves nothing of the previous installation behind', () => {
    const root = scratch();
    configureInstance(root, buildConfig(answers));
    // This installation's file, or the example a fresh copy of the platform is rendered from.
    const own = join(REPO, 'mininode.config.json');
    const previous = loadInstanceConfig(
      REPO,
      existsSync(own) ? own : join(REPO, 'mininode.config.example.json'),
    );
    const all = [
      'apps/portal/wrangler.jsonc',
      'apps/api/wrangler.jsonc',
      'apps/ai-proxy/wrangler.jsonc',
      'supabase/config.toml',
    ]
      .map((file) => readFileSync(join(root, file), 'utf8'))
      .join('\n');
    const owned = [
      previous.cloudflare.accountId,
      previous.environments.production.domain,
      previous.environments.production.supabase.projectRef,
      previous.environments.production.supabase.publishableKey,
      previous.environments.staging?.supabase.projectRef,
      previous.github?.repository,
    ].filter((value): value is string => Boolean(value));
    for (const value of owned) expect(all, value).not.toContain(value);
  });

  it('is idempotent and reports drift with --check', () => {
    const root = scratch();
    const config = buildConfig(answers);
    configureInstance(root, config);
    expect(configureInstance(root, config).changed).toEqual([]);
    expect(
      configureInstance(root, buildConfig({ ...answers, domain: 'other.example.org' }), {
        check: true,
      }).changed,
    ).toHaveLength(4);
    expect(configureInstance(root, config, { check: true }).changed).toEqual([]);
  });

  it('keeps or drops the staging project in config.toml as configured', () => {
    const root = scratch();
    const without = buildConfig(answers);
    configureInstance(root, without);
    expect(readFileSync(join(root, 'supabase/config.toml'), 'utf8')).not.toContain(
      'remotes.staging',
    );
    const withStaging = {
      ...without,
      environments: {
        ...without.environments,
        staging: {
          supabase: {
            projectRef: 'tsrqponmlkjihgfedcba',
            publishableKey: 'sb_publishable_fedcba9876543210',
          },
        },
      },
    };
    configureInstance(root, withStaging);
    expect(readFileSync(join(root, 'supabase/config.toml'), 'utf8')).toContain(
      'project_id = "tsrqponmlkjihgfedcba"',
    );
    configureInstance(root, without);
    expect(readFileSync(join(root, 'supabase/config.toml'), 'utf8')).not.toContain(
      'tsrqponmlkjihgfedcba',
    );
  });

  it('fails loudly when a key is missing or ambiguous', () => {
    expect(() => setJsonString('{ "a": "1" }', 'b', 'x')).toThrow(/exactly one "b"/);
    expect(() => setJsonString('{ "a": "1", "x": { "a": "2" } }', 'a', 'x')).toThrow(/found 2/);
    expect(() => setTomlValue('[t]\nk = 1\n', 'other', 'k', '2')).toThrow(/no \[other\]/);
    expect(() => setTomlValue('[t]\nk = 1\n[u]\nj = 1\n', 't', 'j', '2')).toThrow(/no j in \[t\]/);
  });

  // A fresh copy of the platform has no mininode.config.json until `mininode init` wrote it.
  it.skipIf(!existsSync(join(REPO, 'mininode.config.json')))(
    'is in sync for this repository (the same check as CI)',
    () => {
      expect(configureInstance(REPO, loadInstanceConfig(REPO), { check: true }).changed).toEqual(
        [],
      );
    },
  );
});

describe('init answers', () => {
  it('reports every problem at once', () => {
    expect(() => buildConfig({ domain: 'nope', accountId: 'x' })).toThrow(/accountId[\s\S]*domain/);
  });
});

describe('workflow action', () => {
  it('exports the same values as `mininode config env`', () => {
    const action = readFileSync(join(REPO, '.github/actions/load-config/action.yml'), 'utf8');
    const script = /run: \|\n([\s\S]*)$/.exec(action)?.[1]?.replace(/^ {8}/gm, '') ?? '';
    const root = mkdtempSync(join(tmpdir(), 'mininode-action-'));
    dirs.push(root);
    const config = buildConfig(answers);
    writeFileSync(join(root, 'mininode.config.json'), JSON.stringify(config));
    const githubEnv = join(root, 'env');
    writeFileSync(githubEnv, '');
    execFileSync('bash', ['-c', script], {
      cwd: root,
      env: { ...process.env, ENVIRONMENT: 'production', GITHUB_ENV: githubEnv },
    });
    const exported = Object.fromEntries(
      readFileSync(githubEnv, 'utf8')
        .trim()
        .split('\n')
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    expect(exported).toEqual(environmentVariables(config, 'production'));
  });
});
