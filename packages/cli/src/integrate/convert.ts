import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { MANIFEST_FILENAME, type ManifestInput, manifestSchema } from '@mininode/manifest';
import { anonymiseEmails, NON_TEXT } from '../export.ts';
import type { Inspection, PackageJson } from './inspect.ts';

export interface ConvertContext {
  inspection: Inspection;
  slug: string;
  name: string;
  description: string;
  /** Folder the app is written to (`hosted/<slug>`). */
  outDir: string;
  /** What the ZIP was called, for the README. */
  origin: string;
}

export interface Converted {
  actions: string[];
  warnings: string[];
}

/** Server, secrets, lockfiles and the generator's own notes never enter hosted/. */
const DROP_FILES =
  /^(\.env(\..*)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|metadata\.json|mininode-assistant\.md|\.gitignore|\.DS_Store)$/i;
const DROP_PATHS = [/^assets\/\.aistudio\//, /^\.aistudio\//];
/** Dependencies of the dev server and of provider SDKs: the platform provides these. */
const DROP_DEPS = new Set([
  'express',
  'dotenv',
  'cors',
  'tsx',
  'esbuild',
  '@google/genai',
  '@google/generative-ai',
  '@anthropic-ai/sdk',
  'openai',
  '@types/express',
  '@types/cors',
]);

function copyTree(inspection: Inspection, outDir: string, drop: (file: string) => boolean) {
  for (const file of inspection.files) {
    if (DROP_FILES.test(basename(file)) || DROP_PATHS.some((p) => p.test(file)) || drop(file))
      continue;
    mkdirSync(dirname(join(outDir, file)), { recursive: true });
    cpSync(join(inspection.root, file), join(outDir, file));
  }
}

/** The manifest the script writes: private data, login required, reviewed by the admin. */
export function buildManifest(
  ctx: ConvertContext,
  kind: 'spa' | 'static',
): ManifestInput & { $schema: string } {
  const { uses } = ctx.inspection;
  const models = [
    'gemini-flash',
    ...(uses.proModels ? ['gemini-pro'] : []),
    ...(uses.claudeModels ? ['claude-haiku'] : []),
  ] as ('gemini-flash' | 'gemini-pro' | 'claude-haiku')[];
  return {
    $schema: '../../packages/manifest/schema.json',
    specVersion: 1,
    slug: ctx.slug,
    name: ctx.name,
    description: ctx.description,
    kind,
    target: 'cloudflare',
    // The admin grants access under Verwaltung → Apps; nothing is given to everyone by default.
    access: { default: false, roles: ['user', 'trusted', 'admin'] },
    data: { mode: 'private' },
    ...(uses.miniNodeAi ? { ai: { models, monthlyBudgetEur: 3, maxOutputTokens: 4000 } } : {}),
    ...(kind === 'spa' ? { build: { command: 'pnpm build', output: 'dist' } } : {}),
  };
}

function writeManifest(ctx: ConvertContext, kind: 'spa' | 'static') {
  writeFileSync(
    join(ctx.outDir, MANIFEST_FILENAME),
    `${JSON.stringify(buildManifest(ctx, kind), null, 2)}\n`,
  );
}

function readme(ctx: ConvertContext, actions: string[], warnings: string[]): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');
  return `# ${ctx.name}

${ctx.description}

Integriert aus \`${ctx.origin}\` mit \`mininode integrate\` (automatisch, ohne KI-Prüfung).
Der Zugriff ist nicht freigegeben, bis der Admin ihn unter Verwaltung → Apps vergibt.

## Was das Skript geändert hat

${list(actions)}
${warnings.length > 0 ? `\n## Auf einen Blick\n\n${list(warnings)}\n` : ''}`;
}

function writeReadme(ctx: ConvertContext, converted: Converted) {
  writeFileSync(join(ctx.outDir, 'README.md'), readme(ctx, converted.actions, converted.warnings));
}

/** Removes external stylesheet imports (the CSP allows same-origin styles and fonts only). */
export function stripExternalStyles(css: string): { css: string; removed: number } {
  let removed = 0;
  const external =
    /@import\s+(?:url\(\s*(['"]?)https?:[^)]*\)|(['"])https?:[^'"]*\2)[^;]*;[ \t]*\r?\n?/gi;
  const next = css.replace(external, () => {
    removed += 1;
    return '';
  });
  return { css: next, removed };
}

function stripExternalLinks(html: string): { html: string; removed: number } {
  let removed = 0;
  const next = html.replace(/<link\b[^>]*\bhref=["']https?:\/\/[^"']*["'][^>]*>\s*/gi, (tag) => {
    if (/rel=["'](stylesheet|preconnect|dns-prefetch|preload)["']/i.test(tag)) {
      removed += 1;
      return '';
    }
    return tag;
  });
  return { html: next, removed };
}

function cleanAssets(ctx: ConvertContext, converted: Converted) {
  const { inspection, outDir } = ctx;
  let removed = 0;
  for (const file of inspection.files) {
    if (!/\.(css|html?)$/.test(file) || DROP_FILES.test(basename(file))) continue;
    const path = join(outDir, file);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const result = file.endsWith('.css') ? stripExternalStyles(text) : null;
    const links = file.endsWith('.css') ? null : stripExternalLinks(text);
    const next = result?.css ?? links?.html ?? text;
    const count = (result?.removed ?? 0) + (links?.removed ?? 0);
    if (count > 0) {
      writeFileSync(path, next);
      removed += count;
    }
  }
  if (removed > 0) {
    converted.actions.push(
      `${removed} externe Schrift-/Style-Einbindung(en) entfernt (die Sicherheitsregeln erlauben nur eigene Dateien)`,
    );
    converted.warnings.push(
      'Externe Schriften (z. B. Google Fonts) entfallen; es gilt die Ersatzschrift.',
    );
  }
}

/**
 * Icons written as Material Symbols ligatures need the font; it comes from the npm package (same
 * origin) instead of Google, whose address the content security policy blocks. The full font is
 * large: `scripts/subset-icons.py` cuts it to the icons the app uses.
 */
export const ICON_FONT_VERSION = '^0.47.6';

/** An app that ships its own (smaller) copy of the font does not need the package. */
const ownIconFont = (inspection: Inspection) =>
  inspection.files.includes('public/fonts/material-symbols.css');

function noteIconFont(ctx: ConvertContext, converted: Converted) {
  if (!ctx.inspection.iconFont || ownIconFont(ctx.inspection)) return;
  converted.actions.push(
    `Icon-Schrift Material Symbols aus dem Paket material-symbols eingebunden (statt von Google)`,
  );
  converted.warnings.push(
    'Die Icon-Schrift ist 4 MB groß: mit scripts/subset-icons.py auf die genutzten Icons verkleinern.',
  );
}

function bootSource(inspection: Inspection): string {
  const { uses } = inspection;
  const imports = [
    ...(uses.miniNodeShim ? ['installMiniNodeCompat'] : []),
    ...(uses.localStorage ? ['installLocalStorageSync'] : []),
    'mininode',
  ].sort();
  return [
    '// Written by `mininode integrate`: login first, then the compatibility layers, then the app.',
    `import { ${imports.join(', ')} } from '@mininode/sdk';`,
    ...(inspection.iconFont && !ownIconFont(inspection)
      ? [`import 'material-symbols/${inspection.iconFont}.css';`]
      : []),
    '',
    'const mn = await mininode();',
    'await mn.auth.requireLogin();',
    ...(uses.miniNodeShim ? ['await installMiniNodeCompat(mn);'] : []),
    ...(uses.localStorage ? ['await installLocalStorageSync(mn);'] : []),
    '',
  ].join('\n');
}

function viteConfig(original: string): string {
  const react = /plugin-react/.test(original);
  const tailwind = /@tailwindcss\/vite/.test(original);
  const alias = /alias/.test(original);
  const plugins = [react ? 'react()' : '', tailwind ? 'tailwindcss()' : ''].filter(Boolean);
  return [
    ...(alias ? ["import { fileURLToPath } from 'node:url';"] : []),
    ...(tailwind ? ["import tailwindcss from '@tailwindcss/vite';"] : []),
    ...(react ? ["import react from '@vitejs/plugin-react';"] : []),
    "import { defineConfig } from 'vite';",
    '',
    '// Written by `mininode integrate`. Top-level await in the start file needs es2022.',
    'export default defineConfig({',
    `  plugins: [${plugins.join(', ')}],`,
    ...(alias
      ? ["  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },"]
      : []),
    "  build: { target: 'es2022' },",
    '});',
    '',
  ].join('\n');
}

function dependencyPackage(ctx: ConvertContext, original: string): PackageJson {
  const pkg = ctx.inspection.pkg ?? {};
  const keep = (deps: Record<string, string> | undefined) =>
    Object.fromEntries(Object.entries(deps ?? {}).filter(([name]) => !DROP_DEPS.has(name)));
  const dependencies = keep(pkg.dependencies);
  const devDependencies = keep(pkg.devDependencies);
  // Build tools belong in devDependencies; AI Studio lists vite in both.
  for (const tool of [
    'vite',
    '@vitejs/plugin-react',
    '@tailwindcss/vite',
    'tailwindcss',
    'typescript',
  ]) {
    const version = dependencies[tool];
    if (version !== undefined) {
      devDependencies[tool] ??= version;
      delete dependencies[tool];
    }
  }
  if (/plugin-react/.test(original) && devDependencies['@vitejs/plugin-react'] === undefined)
    devDependencies['@vitejs/plugin-react'] = 'latest';
  dependencies['@mininode/sdk'] = 'workspace:*';
  if (ctx.inspection.iconFont && !ownIconFont(ctx.inspection))
    dependencies['material-symbols'] = ICON_FONT_VERSION;
  const sorted = (deps: Record<string, string>) =>
    Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  return {
    name: `@mininode-hosted/${ctx.slug}`,
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: sorted(dependencies),
    devDependencies: sorted(devDependencies),
  };
}

export function convertVite(ctx: ConvertContext): Converted {
  const { inspection, outDir } = ctx;
  const entry = inspection.moduleEntry;
  if (!entry) throw new Error('no module entry');
  const converted: Converted = { actions: [], warnings: [...inspection.warnings] };
  const serverFiles = new Set(
    inspection.files.filter((file) => /^server\.(ts|js|mjs|cjs)$/.test(file)),
  );
  copyTree(
    inspection,
    outDir,
    (file) => serverFiles.has(file) || /^server\//.test(file) || /^vite\.config\.\w+$/.test(file),
  );
  if (serverFiles.size > 0)
    converted.actions.push(
      `Entwicklungs-Server entfernt (${[...serverFiles].join(', ')}): Cloudflare liefert die Dateien aus`,
    );

  let originalConfig = '';
  const configFile = inspection.files.find((file) => /^vite\.config\.\w+$/.test(file));
  if (configFile) originalConfig = readFileSync(join(inspection.root, configFile), 'utf8');
  writeFileSync(join(outDir, 'vite.config.ts'), viteConfig(originalConfig));
  converted.actions.push(
    'vite.config.ts neu geschrieben (ohne Entwicklungs-Einstellungen und Schlüssel)',
  );

  writeFileSync(
    join(outDir, 'package.json'),
    `${JSON.stringify(dependencyPackage(ctx, originalConfig), null, 2)}\n`,
  );
  converted.actions.push(
    'package.json: Server- und KI-Pakete entfernt, @mininode/sdk ergänzt, Skripte dev/build',
  );

  const bootPath = join(dirname(entry), 'mininode-boot.ts');
  writeFileSync(join(outDir, bootPath), bootSource(inspection));
  const entryPath = join(outDir, entry);
  const source = readFileSync(entryPath, 'utf8');
  writeFileSync(entryPath, `import './mininode-boot.ts';\n${source}`);
  converted.actions.push(
    `${bootPath}: Anmeldung vor dem Start${inspection.uses.miniNodeShim ? ', window.MiniNode (Konto, Daten, KI) über die Plattform' : ''}${inspection.uses.localStorage ? ', localStorage mit dem Konto synchronisiert' : ''}`,
  );

  cleanAssets(ctx, converted);
  noteIconFont(ctx, converted);
  writeManifest(ctx, 'spa');
  converted.actions.push(
    `mininode.json: Single-Page-App, Daten privat${inspection.uses.miniNodeAi ? ', KI mit Monatsbudget 3 €' : ''}, Zugriff nicht automatisch`,
  );
  writeReadme(ctx, converted);
  return converted;
}

/** Plain HTML: the page's own scripts start only after login, so they find the account's data. */
export function convertStatic(ctx: ConvertContext): Converted {
  const { inspection, outDir } = ctx;
  const converted: Converted = { actions: [], warnings: [...inspection.warnings] };
  copyTree(inspection, outDir, () => false);
  const htmlPath = join(outDir, 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  let inline = 0;
  // Inline scripts are blocked by the CSP: move them into files.
  html = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (tag: string, attrs: string, body: string) => {
      if (/\bsrc=/.test(attrs)) return tag;
      if (/type=["'](application\/(ld\+)?json|text\/template)["']/i.test(attrs)) return tag;
      if (!body.trim()) return '';
      inline += 1;
      const file = `inline-${inline}.js`;
      writeFileSync(join(outDir, file), `${body.trim()}\n`);
      return `<script${attrs} src="${file}"></script>`;
    },
  );
  if (inline > 0)
    converted.actions.push(`${inline} Inline-Skript(e) in Dateien verschoben (Sicherheitsregeln)`);

  // Local scripts wait for the boot script, which starts them in order after login.
  const scripts: { src: string; type: string | null }[] = [];
  html = html.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (_tag: string, before: string, src: string, after: string) => {
      const type = /type=["']([^"']+)["']/i.exec(`${before} ${after}`)?.[1] ?? null;
      scripts.push({ src, type });
      return '';
    },
  );
  const bootTags = [
    '<script src="/_mininode/sdk.js"></script>',
    '<script src="mininode-boot.js" defer></script>',
  ].join('\n    ');
  html = html.includes('</body>')
    ? html.replace('</body>', `    ${bootTags}\n  </body>`)
    : `${html}\n${bootTags}\n`;
  writeFileSync(htmlPath, html);

  const { uses } = inspection;
  writeFileSync(
    join(outDir, 'mininode-boot.js'),
    [
      "// Written by `mininode integrate`: login first, then the page's own scripts, in order.",
      '(async () => {',
      '  const mn = await window.mininode.mininode();',
      '  await mn.auth.requireLogin();',
      ...(uses.miniNodeShim ? ['  await window.mininode.installMiniNodeCompat(mn);'] : []),
      ...(uses.localStorage ? ['  await window.mininode.installLocalStorageSync(mn);'] : []),
      `  const scripts = ${JSON.stringify(scripts)};`,
      '  for (const { src, type } of scripts) {',
      '    await new Promise((resolve, reject) => {',
      "      const el = document.createElement('script');",
      '      el.src = src;',
      '      if (type) el.type = type;',
      '      el.async = false;',
      '      el.onload = resolve;',
      '      el.onerror = () => reject(new Error(`Skript ${src} lässt sich nicht laden`));',
      '      document.body.append(el);',
      '    });',
      '  }',
      '  // The page finished loading before its scripts started: let them know.',
      "  document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true }));",
      '})();',
      '',
    ].join('\n'),
  );
  converted.actions.push(
    'mininode-boot.js: Anmeldung vor dem Start, danach laufen die Skripte der Seite in ihrer Reihenfolge',
  );
  converted.warnings.push(
    'Die Seite startet erst nach der Anmeldung; DOMContentLoaded wird danach nachgereicht.',
  );
  cleanAssets(ctx, converted);
  writeManifest(ctx, 'static');
  converted.actions.push('mininode.json: statische Seite, Daten privat, Zugriff nicht automatisch');
  writeReadme(ctx, converted);
  return converted;
}

/**
 * Sample people an AI tool writes into demo data (`max@beispiel.de`) would stop the export of the
 * app: they become `max@example.com`.
 */
function anonymiseSampleEmails(ctx: ConvertContext, converted: Converted) {
  let changed = 0;
  const files: string[] = [];
  for (const file of ctx.inspection.files) {
    if (NON_TEXT.test(file) || file.startsWith('vendor/') || file.includes('/vendor/')) continue;
    const path = join(ctx.outDir, file);
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    if (buffer.includes(0)) continue;
    const result = anonymiseEmails(buffer.toString('utf8'));
    if (result.count === 0) continue;
    writeFileSync(path, result.text);
    changed += result.count;
    files.push(file);
  }
  if (changed > 0) {
    converted.actions.push(
      `${changed} Beispiel-E-Mail-Adresse(n) durch @example.com ersetzt (${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''})`,
    );
    converted.warnings.push(
      'E-Mail-Adressen im Code sind durch @example.com ersetzt: prüfen, ob eine davon echt gemeint war.',
    );
  }
}

/**
 * The export already carries a `mininode.json`: it is kept, with what a generator gets wrong
 * regularly set right (unknown keys, a placeholder address, access for everybody), and doctor judges.
 */
export function convertNative(ctx: ConvertContext): Converted {
  const converted: Converted = {
    actions: ['Projekt mit vorhandener mininode.json übernommen'],
    warnings: [],
  };
  const { inspection } = ctx;
  const deps = { ...inspection.pkg?.dependencies, ...inspection.pkg?.devDependencies };
  const vite = inspection.pkg !== null && deps.vite !== undefined;
  const serverFiles = new Set(
    vite ? inspection.files.filter((file) => /^server\.(ts|js|mjs|cjs)$/.test(file)) : [],
  );
  copyTree(
    inspection,
    ctx.outDir,
    (file) =>
      serverFiles.has(file) ||
      (vite && (/^server\//.test(file) || /^vite\.config\.\w+$/.test(file))),
  );
  if (vite) {
    // The same clean-up as for a Vite export without a manifest: the generator's package.json
    // (server, provider SDKs, a name shared by every export: "react-example") and its dev-server
    // settings in vite.config must not reach hosted/.
    const configFile = inspection.files.find((file) => /^vite\.config\.\w+$/.test(file));
    const originalConfig = configFile
      ? readFileSync(join(inspection.root, configFile), 'utf8')
      : '';
    writeFileSync(join(ctx.outDir, 'vite.config.ts'), viteConfig(originalConfig));
    writeFileSync(
      join(ctx.outDir, 'package.json'),
      `${JSON.stringify(dependencyPackage(ctx, originalConfig), null, 2)}\n`,
    );
    converted.actions.push(
      'package.json: Name je App, Server- und KI-Pakete entfernt, @mininode/sdk ergänzt; vite.config.ts ohne Entwicklungs-Einstellungen',
    );
    if (serverFiles.size > 0)
      converted.actions.push(`Entwicklungs-Server entfernt (${[...serverFiles].join(', ')})`);
  }
  const path = join(ctx.outDir, MANIFEST_FILENAME);
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
    access?: { default?: boolean };
    build?: { command?: string };
  };
  let changed = false;
  // The workspace builds with pnpm; a generator writes npm.
  const build = manifest.build?.command;
  if (build && /^npm run /.test(build)) {
    manifest.build = { ...manifest.build, command: build.replace(/^npm run /, 'pnpm ') };
    changed = true;
    converted.actions.push(`Build-Befehl auf „${manifest.build.command}“ gesetzt`);
  }

  // Keys the manifest does not know (an AI tool puts the accent colour or a theme here) are not
  // read by anything; the strict schema would only stop the app because of them.
  const known = new Set(Object.keys(manifestSchema.shape));
  const unknown = Object.keys(manifest).filter((key) => !known.has(key));
  for (const key of unknown) delete manifest[key];
  if (unknown.length > 0) {
    changed = true;
    converted.actions.push(
      `Unbekannte Schlüssel aus mininode.json entfernt: ${unknown.join(', ')}`,
    );
  }
  if (manifest.slug !== ctx.slug) {
    manifest.slug = ctx.slug;
    changed = true;
    converted.actions.push(`Adresse der App auf „${ctx.slug}“ gesetzt`);
  }
  if (manifest.name !== ctx.name) {
    manifest.name = ctx.name;
    changed = true;
    converted.actions.push(`Name der App auf „${ctx.name}“ gesetzt`);
  }
  // Whatever the export asks for, access is the admin's decision: never "for everybody".
  if (manifest.access?.default) {
    manifest.access.default = false;
    changed = true;
    converted.actions.push('access.default auf false gesetzt (Zugriff vergibt der Admin)');
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);

  // Links to fonts and styles on other sites are blocked by the security rules anyway.
  cleanAssets(ctx, converted);
  const entry = inspection.moduleEntry;
  if (entry && vite && inspection.iconFont && !ownIconFont(inspection)) {
    const entryPath = join(ctx.outDir, entry);
    writeFileSync(
      entryPath,
      `import 'material-symbols/${inspection.iconFont}.css';\n${readFileSync(entryPath, 'utf8')}`,
    );
    noteIconFont(ctx, converted);
  }
  anonymiseSampleEmails(ctx, converted);
  if (!ctx.inspection.files.includes('README.md')) writeReadme(ctx, converted);
  return converted;
}

export function removeOutput(outDir: string): void {
  rmSync(outDir, { recursive: true, force: true });
}
