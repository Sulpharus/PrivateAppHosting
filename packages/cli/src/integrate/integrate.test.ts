import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { slugify } from '@mininode/manifest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stripExternalStyles } from './convert.ts';
import { deriveName, integrate } from './index.ts';
import { serverRoutes } from './inspect.ts';
import type { IntegrateResult } from './types.ts';
import { checkZipListing, UnpackError } from './unpack.ts';
import { biomeSkip, lintExemption, tidy } from './verify.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'integrate-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function project(files: Record<string, string>): { input: string; hosted: string } {
  const input = join(dir, 'export');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(input, name)), { recursive: true });
    writeFileSync(join(input, name), content);
  }
  return { input, hosted: join(dir, 'hosted') };
}

/** An AI Studio export of the kind built from the MiniNode assistant brief (Sentinel's shape). */
const studio = (extra: Record<string, string> = {}) => ({
  'package.json': JSON.stringify({
    name: 'react-example',
    dependencies: {
      react: '^19.0.1',
      express: '^4.21.2',
      '@google/genai': '^2.4.0',
      vite: '^6.2.3',
    },
    devDependencies: { '@vitejs/plugin-react': '^5.0.4', tsx: '^4.0.0' },
  }),
  'metadata.json': JSON.stringify({ name: 'Sentinel', description: 'Versicherungsmanager' }),
  'index.html':
    '<!doctype html><html><head><title>Sentinel – Manager</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'server.ts':
    'app.get("/api/health", (req, res) => res.json({}));\napp.get("*", (req, res) => res.send(""));',
  'vite.config.ts':
    "import react from '@vitejs/plugin-react';\nimport path from 'path';\nimport {defineConfig} from 'vite';\nexport default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve(__dirname, '.') } }, server: { hmr: false } });",
  'src/main.tsx': "import App from './App.tsx';\nimport './index.css';\nconsole.log(App);\n",
  'src/index.css':
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400&display=swap');\nbody { margin: 0; }\n",
  'src/App.tsx':
    "export default function App() { const u = window.MiniNode?.auth; localStorage.setItem('a', '1'); return window.MiniNode?.ai.ask('hi') ?? u; }\n",
  ...extra,
});

describe('integrate: Vite / AI Studio exports', () => {
  it('integrates the export and passes doctor', () => {
    const { input, hosted } = project(studio());
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result).toMatchObject({
      status: 'integrated',
      slug: 'sentinel',
      name: 'Sentinel',
      framework: 'vite',
    });
    const out = join(hosted, 'sentinel');
    const manifest = JSON.parse(readFileSync(join(out, 'mininode.json'), 'utf8'));
    expect(manifest).toMatchObject({
      kind: 'spa',
      target: 'cloudflare',
      data: { mode: 'private' },
      access: { default: false },
      ai: { models: ['gemini-flash'] },
    });
    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toMatchObject({ '@mininode/sdk': 'workspace:*', react: '^19.0.1' });
    expect(pkg.dependencies.express).toBeUndefined();
    expect(pkg.dependencies['@google/genai']).toBeUndefined();
    expect(pkg.devDependencies.vite).toBe('^6.2.3');
    expect(existsSync(join(out, 'server.ts'))).toBe(false);
    expect(existsSync(join(out, 'metadata.json'))).toBe(false);
    expect(
      readFileSync(join(out, 'src/main.tsx'), 'utf8').startsWith("import './mininode-boot.ts';"),
    ).toBe(true);
    const boot = readFileSync(join(out, 'src/mininode-boot.ts'), 'utf8');
    expect(boot).toContain('installMiniNodeCompat');
    expect(boot).toContain('installLocalStorageSync');
    expect(readFileSync(join(out, 'src/index.css'), 'utf8')).toBe('body { margin: 0; }\n');
    expect(readFileSync(join(out, 'vite.config.ts'), 'utf8')).toContain("alias: { '@'");
    expect(readFileSync(join(out, 'vite.config.ts'), 'utf8')).not.toContain('hmr');
  });

  it('only wires up what the app uses', () => {
    const { input, hosted } = project(
      studio({ 'src/App.tsx': 'export default function App() { return null; }\n' }),
    );
    integrate({ input, root: dir, hostedDir: hosted });
    const boot = readFileSync(join(hosted, 'sentinel/src/mininode-boot.ts'), 'utf8');
    expect(boot).not.toContain('installMiniNodeCompat');
    expect(boot).not.toContain('installLocalStorageSync');
    const manifest = JSON.parse(readFileSync(join(hosted, 'sentinel/mininode.json'), 'utf8'));
    expect(manifest.ai).toBeUndefined();
  });

  it('warns that scans cannot be read yet', () => {
    const { input, hosted } = project(
      studio({
        'src/App.tsx':
          "export default async function App() { return window.MiniNode?.ai.generateOrConfigure({ prompt: 'x', images: [] }); }\n",
      }),
    );
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.warnings.join(' ')).toContain('Scan');
  });

  it('sends apps with their own backend to review and leaves nothing behind', () => {
    const { input, hosted } = project(
      studio({ 'server.ts': 'app.post("/api/analyze", (req, res) => res.json({}));' }),
    );
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.status).toBe('needs_review');
    expect(result.reasons.map((r) => r.code)).toContain('own_backend');
    expect(existsSync(join(hosted, 'sentinel'))).toBe(false);
  });

  it('sends CDN scripts, import maps and provider SDKs in the browser to review', () => {
    const { input } = project(
      studio({
        'index.html':
          '<html><head><script src="https://cdn.tailwindcss.com"></script><script type="importmap">{}</script></head><body><script type="module" src="/src/main.tsx"></script></body></html>',
        'src/App.tsx': "import { GoogleGenAI } from '@google/genai';\nconsole.log(GoogleGenAI);\n",
      }),
    );
    const codes = integrate({ input, root: dir }).reasons.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['cdn_scripts', 'importmap', 'client_ai_sdk']));
  });

  it('refuses Vite plugins it cannot rewrite', () => {
    const { input } = project(
      studio({ 'vite.config.ts': "import pwa from 'vite-plugin-pwa';\nexport default {};" }),
    );
    expect(integrate({ input, root: dir }).reasons.map((r) => r.code)).toContain('vite_plugins');
  });

  it('does not overwrite an existing app', () => {
    const { input, hosted } = project(studio());
    mkdirSync(join(hosted, 'sentinel'), { recursive: true });
    writeFileSync(join(hosted, 'sentinel/mininode.json'), '{}');
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.reasons.map((r) => r.code)).toEqual(['slug_exists']);
  });

  it('does not mistake the leftovers of a removed app for an app', () => {
    const { input, hosted } = project(studio());
    mkdirSync(join(hosted, 'sentinel/node_modules'), { recursive: true });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.status).toBe('integrated');
  });
});

describe('integrate: other shapes', () => {
  it('moves inline scripts out and starts the page after login (static)', () => {
    const { input, hosted } = project({
      'index.html':
        '<html><head><title>Notizen</title></head><body><button id="b">x</button><script>localStorage.setItem("a","1")</script><script src="app.js"></script></body></html>',
      'app.js': 'console.log(1)',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted, slug: 'notizen' });
    expect(result.status).toBe('integrated');
    const out = join(hosted, 'notizen');
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('/_mininode/sdk.js');
    expect(html).not.toContain('localStorage.setItem');
    const boot = readFileSync(join(out, 'mininode-boot.js'), 'utf8');
    expect(boot).toContain('installLocalStorageSync');
    expect(boot.indexOf('inline-1.js')).toBeLessThan(boot.indexOf('app.js'));
    expect(JSON.parse(readFileSync(join(out, 'mininode.json'), 'utf8')).kind).toBe('static');
  });

  it.each([
    ['next', { 'package.json': '{"dependencies":{"next":"15"}}', 'index.html': '<html></html>' }],
    ['python', { 'requirements.txt': 'flask', 'app.py': 'print(1)' }],
    ['docker', { Dockerfile: 'FROM node', 'package.json': '{}' }],
    ['installer', { 'setup.exe': 'MZ' }],
  ])('sends %s projects to review', (framework, files) => {
    const { input } = project(files);
    const result = integrate({ input, root: dir });
    expect(result.status).toBe('needs_review');
    expect(result.framework).toBe(framework);
  });

  it('takes an app that already has a manifest as it is', () => {
    const { input, hosted } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'fertig',
        name: 'Fertig',
        description: 'Schon umgebaut',
        kind: 'static',
        target: 'cloudflare',
        data: { mode: 'none' },
      }),
      'index.html': '<html></html>',
      'README.md': '# Fertig\n',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result).toMatchObject({ status: 'integrated', slug: 'fertig' });
  });
});

describe('integrate: guards for what an export brings along', () => {
  it('refuses dependencies from paths, git or tarballs', () => {
    const { input } = project(
      studio({
        'package.json': JSON.stringify({
          dependencies: { react: '^19.0.1', evil: 'github:someone/evil', local: 'file:../x' },
          devDependencies: { vite: '^6.2.3', other: 'https://example.org/x.tgz' },
        }),
      }),
    );
    const result = integrate({ input, root: dir });
    expect(result.reasons.filter((r) => r.code === 'dependency_source')).toHaveLength(3);
  });

  it('sends manifests for containers and remote programs to review', () => {
    const { input } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'server',
        name: 'Server',
        description: 'x',
        kind: 'container',
        target: 'nucbox',
        container: { port: 3000 },
      }),
      Dockerfile: 'FROM node',
      'index.html': '<html></html>',
    });
    expect(integrate({ input, root: dir }).reasons.map((r) => r.code)).toContain(
      'manifest_unsupported',
    );
  });

  it('never gives a native export access for everybody', () => {
    const { input, hosted } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'offen',
        name: 'Offen',
        description: 'x',
        kind: 'static',
        target: 'cloudflare',
        access: { default: true, roles: ['user', 'trusted', 'admin'] },
      }),
      'index.html': '<html></html>',
      'README.md': '# Offen\n',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.status).toBe('integrated');
    expect(
      JSON.parse(readFileSync(join(hosted, 'offen/mininode.json'), 'utf8')).access.default,
    ).toBe(false);
  });
});

describe('integrate: what generators get wrong in their own manifest', () => {
  const generated = (extra: Record<string, unknown> = {}) => ({
    'mininode.json': JSON.stringify({
      specVersion: 1,
      slug: 'neue-app',
      name: 'Neue App',
      description: 'Garantien und Belege',
      accent: 'beige',
      kind: 'static',
      target: 'cloudflare',
      ...extra,
    }),
    'index.html': '<html><head><title>Garantie-Box – Belege</title></head></html>',
    'README.md': '# x\n',
    'data.js': 'const sample = "max@beispiel.de"; const own = "x@example.com";',
  });

  it('drops unknown keys, names the app after its title and anonymises sample addresses', () => {
    const { input, hosted } = project(generated());
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result).toMatchObject({ status: 'integrated', slug: 'garantie-box' });
    const manifest = JSON.parse(readFileSync(join(hosted, 'garantie-box/mininode.json'), 'utf8'));
    expect(manifest).not.toHaveProperty('accent');
    expect(manifest).toMatchObject({ slug: 'garantie-box', name: 'Garantie-Box' });
    expect(readFileSync(join(hosted, 'garantie-box/data.js'), 'utf8')).toBe(
      'const sample = "max@example.com"; const own = "x@example.com";',
    );
    expect(result.actions.join(' ')).toContain('accent');
    expect(result.warnings.join(' ')).toContain('@example.com');
  });

  it('cleans the package of a Vite app with a manifest and brings the icon font along', () => {
    const { input, hosted } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'ikonen',
        name: 'Ikonen',
        description: 'x',
        kind: 'spa',
        target: 'cloudflare',
        data: { mode: 'private' },
        build: { command: 'npm run build', output: 'dist' },
      }),
      'package.json': JSON.stringify({
        name: 'react-example',
        dependencies: { react: '^19.0.1', express: '^4.21.2', vite: '^6.2.3' },
      }),
      'index.html':
        '<html><head><title>Ikonen</title><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      'src/main.tsx':
        'import { mininode } from "@mininode/sdk";\nconst x = <span className="material-symbols-outlined">home</span>;\n',
      'server.ts': 'app.listen(3000)',
      'README.md': '# x\n',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result).toMatchObject({ status: 'integrated', slug: 'ikonen' });
    const out = join(hosted, 'ikonen');
    const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('@mininode-hosted/ikonen');
    expect(pkg.dependencies).toMatchObject({ '@mininode/sdk': 'workspace:*' });
    expect(pkg.dependencies).toHaveProperty('material-symbols');
    expect(pkg.dependencies).not.toHaveProperty('express');
    expect(existsSync(join(out, 'server.ts'))).toBe(false);
    expect(readFileSync(join(out, 'src/main.tsx'), 'utf8')).toMatch(
      /^import 'material-symbols\/outlined\.css';/,
    );
    expect(readFileSync(join(out, 'index.html'), 'utf8')).not.toContain('fonts.googleapis.com');
    expect(JSON.parse(readFileSync(join(out, 'mininode.json'), 'utf8')).build.command).toBe(
      'pnpm build',
    );
    expect(result.warnings.join(' ')).toContain('subset-icons');
  });

  it('sends an app with its own stand-in for the platform client to review', () => {
    const { input, hosted } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'ersatz',
        name: 'Ersatz',
        description: 'x',
        kind: 'static',
        target: 'cloudflare',
        data: { mode: 'private' },
      }),
      'index.html':
        '<html><body><script src="/_mininode/sdk.js"></script><script src="app.js"></script></body></html>',
      'app.js':
        'class FallbackMiniNodeClient { get() { return localStorage.getItem("x"); } }\nconst mn = await window.mininode.mininode();',
      'README.md': '# x\n',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.status).toBe('needs_review');
    expect(result.reasons.map((r) => r.code)).toContain('doctor_stand-in-sdk');
    expect(existsSync(join(hosted, 'ersatz'))).toBe(false);
  });

  it('refuses code that reads window.mininode on a page that never loads the SDK', () => {
    const { input, hosted } = project({
      'mininode.json': JSON.stringify({
        specVersion: 1,
        slug: 'ohne-sdk',
        name: 'Ohne SDK',
        description: 'x',
        kind: 'static',
        target: 'cloudflare',
        data: { mode: 'private' },
      }),
      'index.html': '<html><body><script src="app.js"></script></body></html>',
      'app.js': 'const mn = await window.mininode.mininode();',
      'README.md': '# x\n',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.reasons.map((r) => r.code)).toContain('doctor_sdk-not-loaded');
  });

  it('sends an app without any name to review instead of hosting it as "neue-app"', () => {
    const { input, hosted } = project({
      ...generated(),
      'index.html': '<html><head><title>Neue App</title></head></html>',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted });
    expect(result.status).toBe('needs_review');
    expect(result.reasons.map((r) => r.code)).toContain('placeholder_name');
    expect(existsSync(join(hosted, 'neue-app'))).toBe(false);
  });

  it('takes an address given by the caller for a nameless app', () => {
    const { input, hosted } = project({
      ...generated(),
      'index.html': '<html><head><title>Neue App</title></head></html>',
    });
    const result = integrate({ input, root: dir, hostedDir: hosted, slug: 'inventar' });
    expect(result).toMatchObject({ status: 'integrated', slug: 'inventar', name: 'Inventar' });
  });
});

describe('helpers', () => {
  it('derives addresses and names', () => {
    expect(slugify('Mein Versicherungs-Manager!')).toBe('mein-versicherungs-manager');
    expect(slugify('Übung 2')).toBe('ubung-2');
    expect(slugify('123 Rechner')).toBe('app-123-rechner');
    const inspection = { metadata: {}, title: null, pkg: { name: 'react-example' } } as never;
    expect(deriveName(inspection, '/tmp/22e97217-sentinel.zip')).toBe('sentinel');
  });

  it('finds routes besides health and the page itself', () => {
    expect(
      serverRoutes('app.get("/api/health", f); app.get("*", f); app.post("/api/x", f);'),
    ).toEqual(['POST /api/x']);
  });

  it('removes external imports from CSS, whole statements only', () => {
    const css =
      '@import url(\'https://fonts.googleapis.com/css2?family=A:wght@1;2&display=swap\');\n@import "tailwindcss";\n';
    expect(stripExternalStyles(css)).toEqual({ css: '@import "tailwindcss";\n', removed: 1 });
  });

  it('rejects links and escaping paths in a ZIP listing', () => {
    const entry = (mode: string, name: string) =>
      `${mode}  3.0 unx      10 tx       8 defN 26-Oct-01 12:00 ${name}`;
    expect(() => checkZipListing(entry('-rw-r--r--', 'a/b.txt'))).not.toThrow();
    expect(() => checkZipListing(entry('lrwxrwxrwx', 'link'))).toThrow(UnpackError);
    expect(() => checkZipListing(entry('-rw-r--r--', '../evil'))).toThrow(UnpackError);
    expect(() => checkZipListing(entry('-rw-r--r--', '/etc/passwd'))).toThrow(UnpackError);
  });

  it('exempts an app from linting once', () => {
    const base = JSON.stringify({ overrides: [{ includes: ['hosted/**'] }] });
    const once = lintExemption(base, 'sentinel');
    expect(JSON.parse(once).overrides[1]).toEqual({
      includes: ['hosted/sentinel/**'],
      linter: { enabled: false },
    });
    expect(lintExemption(once, 'sentinel')).toBe(once);
  });

  it('leaves an app out of Biome entirely once, for code Biome cannot read', () => {
    const base = JSON.stringify({ files: { includes: ['**', '!graphify-out'] } });
    const once = biomeSkip(base, 'splitter');
    expect(JSON.parse(once).files.includes).toEqual(['**', '!graphify-out', '!hosted/splitter']);
    expect(biomeSkip(once, 'splitter')).toBe(once);
  });

  it('leaves code Biome cannot read out of Biome, but only turns the linter off for lint findings', () => {
    // CI mode: tidy reports the exemption and does not touch biome.json.
    vi.stubEnv('CI', '1');
    const root = join(import.meta.dirname, '../../../..');
    const slug = `zz-tidy-${Date.now().toString(36)}`;
    const app = join(root, 'hosted', slug);
    const result = (): IntegrateResult => ({
      status: 'integrated',
      slug,
      name: 'Tidy',
      framework: 'vite',
      reasons: [],
      warnings: [],
      actions: [],
      outDir: app,
    });
    try {
      mkdirSync(join(app, 'src'), { recursive: true });
      // Tailwind 4: a syntax error for Biome whatever the lint rules say.
      writeFileSync(join(app, 'src/index.css'), '@variant dark (&:where(.dark, .dark *));\n');
      const unreadable = tidy(root, result());
      expect(unreadable.lintExempt).toBe(true);
      expect(unreadable.biomeSkip).toBe(true);

      // Readable code with only a lint finding (an unlabelled button): the linter alone is off.
      rmSync(join(app, 'src/index.css'));
      writeFileSync(join(app, 'src/a.tsx'), 'export const A = () => <div onClick={() => 1} />;\n');
      const lintOnly = tidy(root, result());
      expect(lintOnly.lintExempt).toBe(true);
      expect(lintOnly.biomeSkip).toBeUndefined();
    } finally {
      rmSync(app, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
    // Biome runs several times: slow on a busy CI runner, so the default 5 s is too tight.
  }, 60_000);
});
