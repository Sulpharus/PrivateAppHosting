import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { Framework, Reason } from './types.ts';

export interface PackageJson {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface Inspection {
  root: string;
  files: string[];
  pkg: PackageJson | null;
  /** The export's own `mininode.json` (name and address only), when it has one. */
  manifest: { name?: string; slug?: string } | null;
  framework: Framework;
  /** Why the script cannot (yet) handle the export; empty for the supported shapes. */
  blockers: Reason[];
  warnings: string[];
  /** The page's module script, e.g. `src/main.tsx`. */
  moduleEntry: string | null;
  uses: {
    miniNodeShim: boolean;
    miniNodeAi: boolean;
    miniNodeImages: boolean;
    localStorage: boolean;
    claudeModels: boolean;
    proModels: boolean;
  };
  metadata: { name?: string; description?: string };
  title: string | null;
  /**
   * The app writes its icons as Material Symbols ligatures (`<span class="material-symbols-outlined">
   * home</span>`). AI tools load that font from Google, which the content security policy blocks:
   * the icon names then show as plain text and the layout falls apart. The style it uses.
   */
  iconFont: 'outlined' | 'rounded' | 'sharp' | null;
}

/** The Material Symbols style an app uses, or null. */
export function iconFontStyle(texts: string[]): 'outlined' | 'rounded' | 'sharp' | null {
  for (const text of texts) {
    const match =
      /material-symbols-(outlined|rounded|sharp)|Material[+ ]Symbols[+ ](Outlined|Rounded|Sharp)/i.exec(
        text,
      );
    const style = (match?.[1] ?? match?.[2])?.toLowerCase();
    if (style === 'outlined' || style === 'rounded' || style === 'sharp') return style;
  }
  return null;
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', '__MACOSX', '.venv']);
const CODE = /\.(m?[jt]sx?|cjs|vue|svelte|html?)$/;
const INSTALLERS = /\.(exe|msi|apk|dmg|pkg|deb|rpm|appimage)$/i;
const SERVER_FILE = /^(server|index|app|main)\.(ts|js|mjs|cjs)$/;
/** What a Vite config may import for the script to rewrite it (React and Tailwind apps). */
const VITE_CONFIG_IMPORTS = new Set([
  'vite',
  '@vitejs/plugin-react',
  '@tailwindcss/vite',
  'path',
  'node:path',
  'url',
  'node:url',
]);
const KEY_NAME = '\\w*(?:KEY|SECRET|TOKEN)\\w*';

function* walk(root: string, dir = root): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) yield* walk(root, path);
    else yield path;
  }
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

/** Routes an Express-style server answers besides health checks and the page itself. */
export function serverRoutes(source: string): string[] {
  const routes: string[] = [];
  for (const match of source.matchAll(
    /\b\w+\.(get|post|put|patch|delete|all)\(\s*(['"`])(\/[^'"`]*)\2/g,
  )) {
    const path = match[3] ?? '';
    if (path === '/' || path === '*' || /^\/(api\/)?(health|healthz|ping)\/?$/.test(path)) continue;
    routes.push(`${(match[1] ?? '').toUpperCase()} ${path}`);
  }
  return routes;
}

/** The `<script type="module" src>` of the page. */
export function htmlModuleEntry(html: string): string | null {
  const tag = /<script\b[^>]*\btype=["']module["'][^>]*>/i.exec(html)?.[0] ?? '';
  const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
  return src && !/^https?:/i.test(src) ? src.replace(/^\.?\//, '') : null;
}

export function htmlProblems(html: string, file: string, inlineScripts: boolean): Reason[] {
  const reasons: Reason[] = [];
  if (
    inlineScripts &&
    /<script\b(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>\s*\S/i.test(html)
  )
    reasons.push({
      code: 'inline_scripts',
      file,
      message: 'Die Seite enthält Inline-Skripte, die die Sicherheitsregeln (CSP) sperren.',
    });
  if (/<script\b[^>]*\bsrc=["']https?:\/\//i.test(html))
    reasons.push({
      code: 'cdn_scripts',
      file,
      message:
        'Die Seite lädt Skripte von einem CDN (z. B. Tailwind). Sie müssen gebündelt werden.',
    });
  if (/<script\b[^>]*type=["']importmap["']/i.test(html))
    reasons.push({
      code: 'importmap',
      file,
      message:
        'Die Seite nutzt eine Import-Map. Die Pakete müssen als Abhängigkeiten gebündelt werden.',
    });
  return reasons;
}

/** Registry versions only: no paths, git, tarball or workspace sources that could pull in other code. */
export function isRegistrySpec(spec: string): boolean {
  return /^[\^~<>=*xX0-9. |-]+$/.test(spec) || ['latest', 'next'].includes(spec);
}

export function inspectProject(root: string): Inspection {
  const files = [...walk(root)].map((file) => relative(root, file).replaceAll('\\', '/'));
  const has = (name: string) => files.includes(name);
  const pkg = has('package.json') ? readJson<PackageJson>(join(root, 'package.json')) : null;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const metadata = has('metadata.json')
    ? (readJson<{ name?: string; description?: string }>(join(root, 'metadata.json')) ?? {})
    : {};
  const blockers: Reason[] = [];
  const warnings: string[] = [];
  const html = has('index.html') ? readFileSync(join(root, 'index.html'), 'utf8') : '';

  const text = (file: string) => readFileSync(join(root, file), 'utf8');
  const serverFiles = files.filter(
    (file) => SERVER_FILE.test(file) && deps.express !== undefined && !file.includes('/'),
  );
  const isServerCode = (file: string) =>
    serverFiles.includes(file) || file.startsWith('server/') || file.startsWith('api/');

  let framework: Framework = 'unknown';
  if (has('mininode.json')) framework = 'mininode';
  else if (
    files.length > 0 &&
    files.every((file) => INSTALLERS.test(file) || !CODE.test(file)) &&
    files.some((file) => INSTALLERS.test(file))
  )
    framework = 'installer';
  else if (deps.next || files.some((file) => /^next\.config\./.test(file))) framework = 'next';
  else if (
    has('requirements.txt') ||
    has('pyproject.toml') ||
    has('Pipfile') ||
    files.some((file) => file.endsWith('.py'))
  )
    framework = 'python';
  else if (has('Dockerfile')) framework = 'docker';
  else if (deps.vite || files.some((file) => /^vite\.config\./.test(file))) framework = 'vite';
  else if (pkg && (deps.express || deps.fastify || deps.koa || deps.hono) && !html)
    framework = 'node-server';
  else if (html) framework = 'static';

  const reviewBy: Partial<Record<Framework, string>> = {
    next: 'Next.js (Playbook nextjs.md)',
    python: 'Python-Server (Playbook python-server.md)',
    docker: 'Docker-Container (Playbook docker-generic.md)',
    'node-server': 'Node-Server (Playbook node-server.md)',
    installer: 'Installationsprogramm (läuft über „Programme“, nicht als Web-App)',
    unknown: 'unbekannte Projektform',
  };
  for (const [name, spec] of Object.entries(deps)) {
    if (!isRegistrySpec(spec))
      blockers.push({
        code: 'dependency_source',
        file: 'package.json',
        message: `Die Abhängigkeit ${name} kommt nicht aus der Paket-Registry („${spec}“).`,
      });
  }
  if (framework === 'mininode') {
    const manifest = readJson<{ kind?: string; target?: string; access?: { default?: boolean } }>(
      join(root, 'mininode.json'),
    );
    if (
      !manifest ||
      !['static', 'spa'].includes(manifest.kind ?? '') ||
      manifest.target !== 'cloudflare'
    )
      blockers.push({
        code: 'manifest_unsupported',
        file: 'mininode.json',
        message:
          'Die mitgelieferte mininode.json ist keine statische oder Single-Page-App auf Cloudflare (Container, Remote und andere Ziele braucht eine Prüfung).',
      });
  }
  const review = reviewBy[framework];
  if (review)
    blockers.push({
      code: `framework_${framework}`,
      message: `Dieses Projekt ist ein ${review} und braucht eine KI-Prüfung.`,
    });

  const uses = {
    miniNodeShim: false,
    miniNodeAi: false,
    miniNodeImages: false,
    localStorage: false,
    claudeModels: false,
    proModels: false,
  };
  let moduleEntry: string | null = null;
  if (framework === 'mininode') moduleEntry = htmlModuleEntry(html);

  // The files that name an icon font: markup, styles and code (not what is already a font file).
  const iconFont = iconFontStyle(
    files
      .filter((file) => /\.(m?[jt]sx?|html?|css)$/.test(file) && statSize(root, file) < 2_000_000)
      .map((file) => text(file)),
  );

  if (framework === 'vite' || framework === 'static') {
    if (!has('index.html'))
      blockers.push({ code: 'no_index', message: 'Es gibt keine index.html im Projekt.' });
    moduleEntry = htmlModuleEntry(html);
    blockers.push(...htmlProblems(html, 'index.html', framework === 'vite'));
    if (framework === 'vite' && !moduleEntry)
      blockers.push({
        code: 'no_entry',
        file: 'index.html',
        message: 'index.html verweist auf kein Modul-Skript (script type="module").',
      });

    const configFile = files.find((file) => /^vite\.config\.\w+$/.test(file));
    if (framework === 'vite' && configFile) {
      const unknown = [...text(configFile).matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((match) => match[1] ?? '')
        .filter((source) => !VITE_CONFIG_IMPORTS.has(source));
      if (unknown.length > 0)
        blockers.push({
          code: 'vite_plugins',
          file: configFile,
          message: `Die Vite-Konfiguration nutzt weitere Plugins (${unknown.join(', ')}).`,
        });
    }

    for (const file of files) {
      if (!CODE.test(file) || isServerCode(file) || statSize(root, file) > 2_000_000) continue;
      const code = text(file);
      const at = (rule: Reason) => blockers.push({ ...rule, file });
      if (
        /from\s+['"](@google\/genai|@google\/generative-ai|@anthropic-ai\/sdk|openai)['"]/.test(
          code,
        )
      )
        at({
          code: 'client_ai_sdk',
          message: 'Ruft einen KI-Anbieter direkt aus dem Browser auf. Das muss über mn.ai laufen.',
        });
      if (
        new RegExp(`process\\.env\\.${KEY_NAME}|import\\.meta\\.env\\.VITE_${KEY_NAME}`).test(code)
      )
        at({ code: 'client_secret', message: 'Liest einen Schlüssel im Browser-Code.' });
      if (/window\.(claude|storage)\b/.test(code))
        at({
          code: 'artifact_runtime',
          message: 'Nutzt die Claude-Artifact-Laufzeit (window.claude).',
        });
      if (/\bindexedDB\b|from\s+['"](dexie|idb)['"]/.test(code))
        at({ code: 'indexeddb', message: 'Speichert Daten in IndexedDB. Das muss nach mn.kv.' });
      if (
        /from\s+['"](firebase|@firebase\/[\w-]+|firebase\/[\w-]+|@supabase\/supabase-js)['"]/.test(
          code,
        )
      )
        at({ code: 'foreign_backend', message: 'Nutzt ein eigenes Backend (Firebase/Supabase).' });
      if (
        /\bfetch\(\s*(['"`])\/api\/(?!health)/.test(code) ||
        /axios\.\w+\(\s*(['"`])\/api\//.test(code)
      )
        at({ code: 'own_backend', message: 'Ruft ein eigenes Server-Backend unter /api/ auf.' });
      if (/new\s+WebSocket\(|from\s+['"]socket\.io-client['"]/.test(code))
        at({ code: 'websocket', message: 'Nutzt WebSockets zu einem eigenen Server.' });
      if (/\son(click|change|submit|load|input|keydown)=["']/.test(code) && file.endsWith('.html'))
        at({
          code: 'inline_handlers',
          message: 'HTML-Attribute wie onclick sind durch die Sicherheitsregeln (CSP) gesperrt.',
        });
      if (/window\.MiniNode|MiniNode\.(ai|db|auth|ui)\b/.test(code)) uses.miniNodeShim = true;
      if (/MiniNode\.ai\b|\.ai\.(generate|ask|generateOrConfigure)\(/.test(code))
        uses.miniNodeAi = true;
      if (/\bimages\s*:/.test(code) && /MiniNode|generateOrConfigure/.test(code))
        uses.miniNodeImages = true;
      if (/\blocalStorage\b/.test(code)) uses.localStorage = true;
      if (/claude/i.test(code) && /provider\s*:\s*['"]claude['"]|claude-/.test(code))
        uses.claudeModels = true;
      if (/gemini[\w.-]*pro|['"]pro['"]/.test(code)) uses.proModels = true;
    }

    // A server file next to a Vite app is usually only the dev server (AI Studio adds one).
    for (const file of serverFiles) {
      const routes = serverRoutes(text(file));
      if (routes.length > 0)
        blockers.push({
          code: 'own_backend',
          file,
          message: `Der Server beantwortet eigene Anfragen (${routes.slice(0, 4).join(', ')}). Das braucht eine KI-Prüfung.`,
        });
    }
    if (deps['@google/genai'] || deps['@google/generative-ai']) {
      const serverUsesAi = serverFiles.some((file) => /genai|generative-ai/.test(text(file)));
      if (serverUsesAi)
        blockers.push({
          code: 'server_ai',
          message: 'Der Server ruft die KI direkt auf. Das muss über mn.ai laufen.',
        });
    }
    if (uses.miniNodeImages)
      warnings.push(
        'Bild- und Scan-Analyse (OCR) funktioniert noch nicht: der KI-Proxy leitet nur Text weiter. Die App zeigt dafür eine Fehlermeldung.',
      );
  }

  return {
    root,
    files,
    pkg,
    manifest:
      framework === 'mininode'
        ? readJson<{ name?: string; slug?: string }>(join(root, 'mininode.json'))
        : null,
    framework,
    blockers,
    warnings,
    moduleEntry,
    uses,
    metadata,
    title: /<title>([^<]+)<\/title>/i.exec(html)?.[1]?.trim() ?? null,
    iconFont,
  };
}

function statSize(root: string, file: string): number {
  const path = join(root, file);
  return existsSync(path) ? statSync(path).size : 0;
}

export const isInstaller = (file: string) => INSTALLERS.test(file);
export const fileExtension = (file: string) => extname(file).toLowerCase();
