// Composes the construction prompt for an app from the library in docs/ai (ADR 0003 §1, ADR 0029):
// the reference (spec, design system, language packages, app type, feature modules) first, wrapped in
// tags, then the task, the delivery steps for the chosen tool, the numbered hard rules and a closing
// checklist. Each tool gets the shape that works best for it: one long prompt, a short prompt plus a
// reference file, a pointer into the repository, or a compact prompt for small local models.

export interface PromptPart {
  id: string;
  title: string;
  summary: string;
  /** Plain German: when to choose this block (shown as a tooltip in the composer). */
  when?: string;
  accent?: string;
  /** Modules only: the id of the group they are listed under (see MODULE_GROUPS). */
  group?: string;
  /** Types only: the audience (data mode) the type suggests. */
  audience?: Audience;
  /** Types only: the feature modules the type suggests. */
  modules?: string[];
  order: number;
  body: string;
}

export interface Library {
  spec: string;
  specShort: string;
  design: string;
  /** The language package guide (docs/ai/LANGUAGE-PACKAGES.md). */
  language: string;
  kitCss: string;
  kitJs: string;
  i18nJs: string;
  /** The preview SDK of the starter package (packages/ui/kit/sdk-preview.js). */
  previewSdk: string;
  types: PromptPart[];
  modules: PromptPart[];
}

export type Audience = 'me' | 'household' | 'group' | 'team' | 'readonly' | 'none';
export type Builder =
  | 'repo-agent'
  | 'claude'
  | 'chatgpt'
  | 'ai-studio'
  | 'bolt'
  | 'local'
  | 'other';
export type Task = 'new' | 'extend' | 'fix';

export interface Brief {
  task: Task;
  name: string;
  idea: string;
  audience: Audience;
  builder: Builder;
  type: string;
  modules: string[];
  accent: string;
  extra: string;
  /** `mininode doctor` output, for the task "fix". */
  findings: string;
  /** Shorter design system and language guide, for tools with small prompt limits. */
  short: boolean;
}

/** Older builder ids (briefs, saved links) and what they are now. */
export const BUILDER_ALIASES: Record<string, Builder> = {
  'claude-artifact': 'claude',
  'claude-code': 'repo-agent',
};

/**
 * The prompt for adding the language packages to an app that already exists: the task
 * (docs/ai/RETROFIT-LANGUAGE.md) followed by the full guide, so that any AI tool can follow it
 * without reading the repository.
 */
export function retrofitLanguagePrompt(task: string, language: string): string {
  return `${task.trim()}\n\n## The language package guide\n\n${guideText(language)}\n`;
}

/** The collapsible groups of features in the composer, in this order. */
export const MODULE_GROUPS: { id: string; label: string; hint: string }[] = [
  { id: 'daten', label: 'Daten und Inhalte', hint: 'Eingeben, speichern, finden, drucken' },
  { id: 'anbindungen', label: 'KI und Anbindungen', hint: 'KI, Google, APIs, Karten, andere Apps' },
  {
    id: 'teilen',
    label: 'Teilen und Zusammenarbeit',
    hint: 'Mehrere Personen, Rechte, Kommentare',
  },
  { id: 'offline', label: 'Erinnerungen und Offline', hint: 'Push, Timer, ohne Internet arbeiten' },
  {
    id: 'qualitaet',
    label: 'Qualität und Bedienung',
    hint: 'Start, Tastatur, Barrierefreiheit, Tests',
  },
  { id: 'spiele', label: 'Spiele', hint: 'Gaming Hub, Steuerung, Level, Generatoren' },
  {
    id: 'server',
    label: 'Server und Programme',
    hint: 'Container, PC/Server-Programme, WebAssembly',
  },
];

interface ModuleGroup {
  id: string;
  label: string;
  hint: string;
  parts: PromptPart[];
}

/** Sorts modules into MODULE_GROUPS; modules with an unknown or no group land in "Weitere". */
export function groupModules(modules: PromptPart[]): ModuleGroup[] {
  const known = new Set(MODULE_GROUPS.map((g) => g.id));
  const groups: ModuleGroup[] = MODULE_GROUPS.map((g) => ({
    ...g,
    parts: modules.filter((m) => m.group === g.id),
  }));
  const rest = modules.filter((m) => !m.group || !known.has(m.group));
  if (rest.length) groups.push({ id: 'weitere', label: 'Weitere', hint: '', parts: rest });
  return groups.filter((g) => g.parts.length > 0);
}

export const ACCENTS: [string, string][] = [
  ['green', 'Grün'],
  ['blue', 'Blau'],
  ['violet', 'Violett'],
  ['amber', 'Bernstein'],
  ['rose', 'Rosé'],
  ['teal', 'Petrol'],
];

export const AUDIENCES: Record<
  Audience,
  { label: string; mode: string; note: string; when: string }
> = {
  me: {
    label: 'Nur für mich (jede:r eigene Daten)',
    mode: 'private',
    note: 'Every person has their own private data.',
    when: 'Jede Person sieht nur ihre eigenen Einträge, auch wenn mehrere die App benutzen.',
  },
  household: {
    label: 'Gemeinsam im Haushalt (eine gemeinsame Datenbasis)',
    mode: 'shared-account',
    note: 'Trusted people of the household work on the owner’s data together.',
    when: 'Alle vertrauten Personen im Haushalt arbeiten an denselben Daten, etwa Einkaufsliste oder Haushaltsbuch.',
  },
  group: {
    label: 'Für eine Gruppe (alle sehen alles)',
    mode: 'group',
    note: 'Everyone who has the app shares all data.',
    when: 'Alle, die die App haben, sehen und ändern alles, etwa ein Verein oder Freundeskreis.',
  },
  team: {
    label: 'In Teams (nur eingeladene Personen sehen ein Team)',
    mode: 'team',
    note: 'People work in small teams (projects, trips); each team sees only its own data, with roles viewer, editor and owner.',
    when: 'Kleine Gruppen arbeiten getrennt, etwa pro Projekt oder Reise. Jede Gruppe sieht nur ihre Daten.',
  },
  readonly: {
    label: 'Admin pflegt, alle lesen',
    mode: 'readonly',
    note: 'Admins maintain the content; everyone else reads it.',
    when: 'Nur du (als Admin) trägst ein, alle anderen lesen nur, etwa Vereinstermine oder Regeln.',
  },
  none: {
    label: 'Speichert nichts (Rechner, Werkzeug)',
    mode: 'none',
    note: 'The app stores no data on the platform.',
    when: 'Die App rechnet oder wandelt nur um und muss nichts speichern.',
  },
};

export const TASKS: Record<Task, { label: string; when: string }> = {
  new: {
    label: 'Neue App bauen',
    when: 'Die App gibt es noch nicht. Die KI baut sie von Grund auf.',
  },
  extend: {
    label: 'Bestehende App erweitern',
    when: 'Die App läuft schon auf MiniNode. Die KI baut die gewählten Funktionen ein und lässt den Rest, wie er ist. Den Code der App hängst du an.',
  },
  fix: {
    label: 'Prüfbefunde beheben',
    when: 'Der Upload oder „mininode doctor“ hat Fehler gemeldet. Du fügst die Meldungen ein, die KI behebt genau diese.',
  },
};

type Output = 'full' | 'split' | 'pointer' | 'compact';

interface BuilderInfo {
  label: string;
  /** Plain German: when to choose this tool. */
  when: string;
  /** Plain German: what the owner does, in order. */
  steps: string[];
  output: Output;
  /** Where the starter package puts _mininode/ and i18n/: the root (static) or public/ (Vite). */
  layout: 'static' | 'vite' | null;
  /** The delivery section for the AI (English). */
  text: string;
}

const SDK_LOAD =
  'Load the platform with `<script src="/_mininode/sdk.js"></script>` and `const mn = await window.mininode.mininode();` (the npm package `@mininode/sdk` exists only inside the MiniNode repository).';

const FILE_FALLBACK =
  'If you cannot create files, print every file in its own code block headed by its path instead (`### index.html`, then the code).';

export const BUILDERS: Record<Builder, BuilderInfo> = {
  'repo-agent': {
    label: 'Coding-Agent im Repository (Claude Code, Codex, Cursor, Copilot, Gemini CLI)',
    when: 'Am besten, wenn ein Agent direkt im MiniNode-Repository arbeitet. Er liest die Vorgaben selbst, prüft mit mininode doctor und öffnet einen Pull Request.',
    steps: [
      'Agent im Repository starten (Claude Code, Codex, Cursor, Copilot-Agent, Gemini CLI oder Jules).',
      'Den kurzen Prompt einfügen. Bei Copilot geht er auch als Issue, das du Copilot zuweist.',
      'Pull Request prüfen und mergen.',
    ],
    output: 'pointer',
    layout: null,
    text: '',
  },
  claude: {
    label: 'Claude (claude.ai)',
    when: 'Gut für die meisten Apps, wenn du im Chat baust. Claude legt echte Dateien an und gibt dir ein ZIP.',
    steps: [
      'In claude.ai „Dateien erstellen“ (Code-Ausführung) einschalten, falls aus.',
      'Startpaket (ZIP) herunterladen und an die Nachricht hängen.',
      'Prompt einfügen und senden. Das fertige ZIP lädst du unter Hochladen hoch.',
    ],
    output: 'full',
    layout: 'static',
    text: `Work in your code environment (file creation).
1. Unpack the attached starter package. Copy its files with commands, never retype them: \`_mininode/\` (App Kit and a preview SDK), \`i18n/de.json\`, \`i18n/en.json\`, \`mininode.json\`, \`index.html\`, \`AGENTS.md\` and \`MININODE-REFERENCE.md\` (this reference again).
2. Build a static app: \`index.html\`, CSS and plain JavaScript modules, no build step. Use Vite + React + TypeScript only when the brief clearly needs it; then move \`_mininode/\` and \`i18n/\` into \`public/\`.
3. ${SDK_LOAD} The preview SDK makes the app run in your environment; MiniNode replaces it.
4. Hand over one ZIP of the project (no \`node_modules\`) as a downloadable file. ${FILE_FALLBACK}
For a quick look you may also show \`index.html\` as an artifact; the preview keeps data in the browser.`,
  },
  chatgpt: {
    label: 'ChatGPT',
    when: 'Wenn du in ChatGPT baust. Der Prompt ist kurz, die ausführlichen Vorgaben hängen als Datei an.',
    steps: [
      'Startpaket (ZIP) herunterladen, es enthält auch die Referenzdatei MININODE-REFERENCE.md.',
      'In ChatGPT das ZIP und die Referenzdatei anhängen.',
      'Prompt einfügen und senden. Das fertige ZIP lädst du unter Hochladen hoch.',
    ],
    output: 'split',
    layout: 'static',
    text: `1. The starter package and \`MININODE-REFERENCE.md\` are attached. Read the reference completely before you start: it is the specification (platform, design system, language packages, app type, features). Unpack the starter package in your Python environment and copy its files with code, never retype them.
2. Build a static app: \`index.html\`, CSS and plain JavaScript modules, no build step, unless the brief clearly needs React (then Vite + React + TypeScript with \`_mininode/\` and \`i18n/\` in \`public/\`).
3. ${SDK_LOAD} The preview SDK in \`_mininode/\` makes the app run; MiniNode replaces it.
4. Create one ZIP of the project and offer it as a download. ${FILE_FALLBACK}
Do not stop to ask questions unless the brief is empty; choose the simpler option and list your assumptions at the end.`,
  },
  'ai-studio': {
    label: 'Google AI Studio (Build)',
    when: 'Wenn du in Google AI Studio baust. Es baut gern mit Server, Firebase und Tailwind: der Prompt schaltet das ab.',
    steps: [
      'Startpaket (ZIP) herunterladen und in AI Studio unter „Build“ hochladen (Plus → Dateien hinzufügen).',
      'Prompt einfügen und senden.',
      'Projekt als ZIP herunterladen und unter Hochladen hochladen.',
    ],
    output: 'full',
    layout: 'vite',
    text: `AI Studio's default is a full-stack app (React, Vite, Tailwind, a Node server, Firebase, Gemini calls with a key). MiniNode needs a client-only app:
1. Keep the uploaded starter package and its paths: \`public/_mininode/\` (App Kit and a preview SDK), \`public/i18n/\`, \`mininode.json\`, \`index.html\`, \`AGENTS.md\`.
2. Vite + React + TypeScript only. No server (no \`server.ts\`, Express or API routes), no Firebase, no Tailwind, no \`@google/genai\`, no API key, no \`process.env\`, no import map, \`esm.sh\` or CDN script.
3. ${SDK_LOAD} Declare the calls you use in \`src/mininode.d.ts\` (an interface for \`window.mininode\`, without \`any\`). AI goes through \`mn.ai\`, never Gemini directly.
4. Hand over by "Download app" as a ZIP.`,
  },
  bolt: {
    label: 'Bolt.new',
    when: 'Wenn du in Bolt baust. Die festen Regeln kommen ins Projektwissen, der Prompt bleibt kurz.',
    steps: [
      'In Bolt ein neues Projekt anlegen und unter Projekteinstellungen → Knowledge den Block „Regeln fürs Wissensfeld“ einfügen.',
      'Startpaket (ZIP) entpackt ins Projekt ziehen, MININODE-REFERENCE.md gehört dazu.',
      'Prompt senden. Am Ende das Projekt als ZIP herunterladen und hochladen.',
    ],
    output: 'split',
    layout: 'vite',
    text: `1. The project contains the starter package: \`public/_mininode/\` (App Kit and a preview SDK), \`public/i18n/\`, \`mininode.json\`, \`index.html\`, \`AGENTS.md\` and \`MININODE-REFERENCE.md\`. Read \`MININODE-REFERENCE.md\` completely first: it is the specification.
2. A plain Vite + React + TypeScript app. Do not enable Bolt Database, Bolt Cloud authentication, Supabase or Netlify functions; no Tailwind, no component library.
3. ${SDK_LOAD}
4. The owner downloads the project as a ZIP; keep \`node_modules\` and build output out of the project.`,
  },
  local: {
    label: 'Lokales oder kleines Modell (Ollama, LM Studio)',
    when: 'Für Modelle auf dem eigenen Rechner oder mit kleinem Kontext. Der Prompt ist kompakt, gebaut wird in Schritten.',
    steps: [
      'Kontextlänge im Werkzeug auf mindestens 32.000 Tokens stellen (Ollama: num_ctx).',
      'Prompt einfügen. Nach jedem Schritt „weiter“ schreiben.',
      'Dateien in einen Ordner speichern, das Startpaket dazulegen, als ZIP hochladen.',
    ],
    output: 'compact',
    layout: 'static',
    text: `Work in steps and wait for "weiter" after each:
1. **Plan:** the views, the tables with their columns, the files. No code yet.
2. **Scaffold:** \`index.html\` (from the skeleton above), \`app.js\`, \`app.css\`, \`mininode.json\`, \`db/001_init.sql\`, \`i18n/de.json\`, \`i18n/en.json\`, with the views empty.
3. **One feature per step**, in the order of the brief.
Print every file completely in its own code block headed by its path. Static HTML with plain JavaScript modules, no build step. ${SDK_LOAD}`,
  },
  other: {
    label: 'Andere KI',
    when: 'Für jedes andere Werkzeug. Der Prompt enthält alles; das Startpaket hängst du an, wenn das Werkzeug Dateien annimmt.',
    steps: [
      'Startpaket (ZIP) herunterladen und anhängen, wenn das Werkzeug Dateien annimmt.',
      'Prompt einfügen und senden.',
      'Ergebnis als ZIP unter Hochladen hochladen.',
    ],
    output: 'full',
    layout: 'static',
    text: `1. If the starter package is attached, keep its files and paths (\`_mininode/\`, \`i18n/\`, \`mininode.json\`, \`index.html\`) and never retype \`_mininode/\` files. Without it, link the same paths anyway: MiniNode serves them.
2. Build a static app (HTML, CSS, plain JavaScript modules) or, when the brief needs it, Vite + React + TypeScript (then \`_mininode/\` and \`i18n/\` go into \`public/\`).
3. ${SDK_LOAD}
4. Deliver a ZIP of the project. ${FILE_FALLBACK}`,
  },
};

/** "Bücherregal Plus" → "buecherregal-plus". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

const AUDIENCE_IDS = Object.keys(AUDIENCES) as Audience[];

/** Reads the front matter (`key: value` lines between `---`) and the Markdown body. */
export function parsePart(raw: string): PromptPart {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  if (match?.[1])
    for (const line of match[1].split(/\r?\n/)) {
      const at = line.indexOf(':');
      if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  const body = (match ? (match[2] ?? '') : raw).trim();
  const audience = AUDIENCE_IDS.find((a) => a === meta.audience);
  const modules = (meta.modules ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    id: meta.id ?? '',
    title: meta.title ?? meta.id ?? '',
    summary: meta.summary ?? '',
    ...(meta.when ? { when: meta.when } : {}),
    ...(meta.accent ? { accent: meta.accent } : {}),
    ...(meta.group ? { group: meta.group } : {}),
    ...(audience ? { audience } : {}),
    ...(modules.length ? { modules } : {}),
    order: Number(meta.order ?? 100),
    body,
  };
}

export function sortParts(parts: PromptPart[]): PromptPart[] {
  return [...parts]
    .filter((p) => p.id)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** The modules a prompt really contains: the chosen ones plus those the data mode needs. */
export function effectiveModules(brief: Brief, lib: Library): PromptPart[] {
  const ids = new Set(brief.modules);
  if (brief.audience !== 'none') ids.add('tables');
  if (brief.audience === 'team') ids.add('teams');
  if (brief.audience === 'readonly') ids.add('readonly-content');
  return lib.modules.filter((m) => ids.has(m.id));
}

/** Modules the composer adds on its own for this audience (shown in the form). */
export function impliedModules(audience: Audience): string[] {
  return [
    ...(audience !== 'none' ? ['tables'] : []),
    ...(audience === 'team' ? ['teams'] : []),
    ...(audience === 'readonly' ? ['readonly-content'] : []),
  ];
}

const stripMarkers = (text: string) => text.replace(/<!--[\s\S]*?-->\n?/g, '');

/** The spec part every prompt carries (between the short markers; the rest is in the checklist). */
function specText(lib: Library): string {
  return stripMarkers(lib.specShort)
    .replace(/^# .*\n+/, '')
    .trim();
}

/** The design system, without its long-only parts when short. */
function designText(lib: Library, short: boolean): string {
  const text = short
    ? lib.design.replace(/<!-- full:start -->[\s\S]*?<!-- full:end -->\n?/g, '')
    : lib.design;
  return stripMarkers(text)
    .replace(/^# .*\n+/, '')
    .trim();
}

function guideText(language: string, short = false): string {
  let text = language
    .trim()
    .replace(/^# .*\n+/, '')
    .replace(/^## (\d+)\. /gm, '### $1. ');
  // Short: the writing rules stay, the long explanations of section 2 are the spec's rule 5 already.
  if (short) text = text.replace(/### 2\. [\s\S]*?(?=### 3\. )/, '');
  return text;
}

/** One `### heading` section of the spec (up to the next heading of the same level). */
function specSection(lib: Library, heading: string): string {
  const text = stripMarkers(lib.spec);
  const start = text.indexOf(`### ${heading}`);
  if (start < 0) return '';
  const rest = text.slice(start);
  const end = rest.indexOf('\n### ', 4);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

interface Context {
  brief: Brief;
  named: boolean;
  name: string;
  slug: string;
  type: PromptPart | undefined;
  modules: PromptPart[];
  audience: (typeof AUDIENCES)[Audience];
  builder: BuilderInfo;
  starter: boolean;
}

function context(brief: Brief, lib: Library): Context {
  // No name in the brief: the AI picks one. A placeholder ("Neue App") must never reach the upload.
  const named = brief.name.trim().length > 0 && slugify(brief.name).length >= 2;
  const name = named ? brief.name.trim() : '';
  const builder = BUILDERS[brief.builder];
  return {
    brief,
    named,
    name,
    slug: named ? slugify(name) : '',
    type: lib.types.find((t) => t.id === brief.type),
    modules: effectiveModules(brief, lib),
    audience: AUDIENCES[brief.audience],
    builder,
    starter: builder.layout !== null,
  };
}

const has = (ctx: Context, ...ids: string[]) => ctx.modules.some((m) => ids.includes(m.id));

/** The numbered rules every app must keep, most often broken first. */
export function hardRules(brief: Brief, lib: Library): string[] {
  const ctx = context(brief, lib);
  const rules = [
    'Use the MiniNode SDK (`mn`) for login, data, files, AI and external APIs. Never build a login, a backend or API-key handling, never import a provider SDK (`@google/genai`, `openai`, `@anthropic-ai/sdk`) and never call another host from the page.',
    ctx.brief.audience === 'none'
      ? 'The app stores no data on the platform (data mode `none`); keep state in memory.'
      : 'Every list of entries is a table: SQL in `db/001_init.sql` (schema `app_<slug>`, `platform.secure_table` for every table) and `mn.table` in the app. `mn.kv` holds only settings and small state, never one key per entry.',
    `\`mininode.json\` has ${ctx.named ? `slug \`${ctx.slug}\`` : 'the slug and name you chose (never "neue-app" or "Neue App")'}, data mode \`${ctx.audience.mode}\` and only keys the spec documents (the accent is \`data-accent\` in the HTML, never a key there).`,
    '`localStorage` and `IndexedDB` are never where data lives; no service worker, web manifest or push code of your own.',
    'Load `/_mininode/ui.css`, `/_mininode/ui.js`, `/_mininode/i18n.js` and `/_mininode/sdk.js` by exactly these paths. Everything else is bundled with the app: no CDN scripts, import maps, `esm.sh` or Google Fonts.',
    `Look: only the App Kit. \`<html lang="de" data-accent="${ctx.brief.accent}">\`, \`<body class="mn-app">\`, the shell (\`mn-nav\`, \`mn-top\`, \`mn-main\`), \`mn-*\` components and \`--mn-*\` tokens. No Tailwind, component libraries, gradients, emoji, raw colours or font names.`,
    ctx.starter
      ? 'No stand-in for the platform: no `window.MiniNode`, no fallback, mock or bridge for "when MiniNode is not there". The `_mininode/` folder of the starter package is the only stand-in: never edit or imitate it.'
      : 'No stand-in for the platform: no `window.MiniNode`, no fallback, mock or bridge for "when MiniNode is not there", no `_mininode/` folder in the app.',
    'Every text for people is in `i18n/de.json` and `i18n/en.json` (same keys and placeholders, plural forms; German "du", plain British English). Dates, numbers and amounts follow `mnI18n.locale` and `mnui.date.format`; never hard-code `\'de-DE\'`.',
    'Phone first: works from 360 px, touch targets at least 44 px, light and dark mode, a visible `:focus-visible` on everything, dialogs trap focus and close on Escape, animations only on `transform`/`opacity` and off with `prefers-reduced-motion`.',
    'Every view has a loading skeleton, an empty state with its one action, and an error message with "Erneut versuchen" for every network call.',
    'Text from people or other sites is shown with `textContent` (or escaped JSX), never through `innerHTML`.',
    has(ctx, 'ai', 'ai-chat', 'ai-vision')
      ? 'AI runs only when the person presses a button for it, through `mn.ai`, with the models and a small monthly budget declared under `ai` in `mininode.json`.'
      : 'No AI calls: the brief did not ask for them.',
    'Sample data uses `@example.com` addresses only.',
    'Build what the brief and the chosen features ask, nothing more: no extra views, features or libraries. When something is unclear, take the simpler option and list your assumptions at the end.',
    'Deliver exactly as the section "How to build and deliver" says.',
  ];
  return rules;
}

function checklist(ctx: Context): string[] {
  const manifest = [
    ctx.named ? `slug \`${ctx.slug}\`` : 'the chosen slug and name',
    `data mode \`${ctx.audience.mode}\``,
    'the `i18n` block (de, en)',
    ...(has(ctx, 'ai', 'ai-chat', 'ai-vision')
      ? [
          '`ai.models` with a monthly budget of 1 to 5 € (and `"search": true` if it calls `mn.ai.search`)',
        ]
      : []),
    ...(has(ctx, 'google') ? ['the `google` block with the least access the app needs'] : []),
    ...(has(ctx, 'api-keys', 'places') ? ['an `apis` entry for every external API'] : []),
    ...(has(ctx, 'game-hub', 'multiplayer', 'game-kit') ? ['the `game` block with its stats'] : []),
    ...(has(ctx, 'suite') ? ['the `suite.uses` it needs'] : []),
    ...(has(ctx, 'wasm') ? ['`"wasm": true`'] : []),
  ];
  return [
    `\`mininode.json\`: ${manifest.join(', ')} (rule 3).`,
    ...(ctx.brief.audience === 'none'
      ? []
      : [
          '`db/001_init.sql` has one table per kind of entry with real column types, and `platform.secure_table` for each (rule 2).',
        ]),
    '`index.html` loads the four `/_mininode/` files, has `data-accent` and `body.mn-app` (rules 5, 6).',
    '`i18n/de.json` and `i18n/en.json` have the same keys; no text for people is left in the code; the app reads well in both languages (rule 8).',
    'Every view checked at 360, 768 and 1280 px, in light and dark mode (rule 9), empty, loading and with errors (rule 10).',
    'No `localStorage` for data, no CDN script, no API key, no raw colour or font name, no `window.MiniNode` (rules 1, 4, 5, 6, 7).',
    'A README says what the app does, what it stores and how to try it.',
    'Your summary to the owner names the app, the tables, the assumptions you made and what the owner still has to set up (API keys, Google, approvals).',
  ];
}

function briefSection(ctx: Context): string[] {
  const { brief, type } = ctx;
  const lines: string[] = [];
  if (brief.task === 'new') {
    if (ctx.named) {
      lines.push(`- **Name:** ${ctx.name}`);
      lines.push(
        `- **Slug:** \`${ctx.slug}\` (the app runs at https://${ctx.slug}.${typeof location === 'undefined' ? '<domain>' : location.hostname})`,
      );
    } else {
      lines.push(
        '- **Name and slug:** the brief gives none. Choose a short, distinctive name (not "Neue App", not "New app", not a generic word like "Tracker") and its slug (lowercase letters, digits and hyphens, e.g. `garantie-box`), and use them in `mininode.json`, the `<title>`, the app header and the README. Tell the owner which you chose.',
      );
    }
  } else {
    lines.push(
      `- **App:** ${ctx.named ? `${ctx.name} (\`${ctx.slug}\`)` : 'the attached app (its `mininode.json` names it)'}`,
    );
  }
  if (type) lines.push(`- **Kind of app:** ${type.title} (${type.summary})`);
  lines.push(`- **Who uses it:** ${ctx.audience.note} Data mode \`${ctx.audience.mode}\`.`);
  lines.push(
    `- **Accent:** \`data-accent="${brief.accent}"\` (${ACCENTS.find(([id]) => id === brief.accent)?.[1] ?? brief.accent}).`,
  );
  if (ctx.modules.length)
    lines.push(
      `- **Features:** ${ctx.modules.map((m) => `${m.title} (${m.summary})`).join('; ')}.`,
    );
  lines.push('');
  if (brief.task === 'fix') {
    lines.push('**The findings to fix:**', '', '```text');
    lines.push(brief.findings.trim() || '(No findings pasted: ask for them before you start.)');
    lines.push('```');
  } else {
    lines.push(
      brief.task === 'extend'
        ? '**What to add, in the owner’s words:**'
        : '**What it should do, in the owner’s words:**',
      '',
    );
    const idea = brief.idea.trim() || '(No description given: ask before you start.)';
    lines.push(...idea.split(/\r?\n/).map((l) => `> ${l}`));
  }
  if (brief.extra.trim()) lines.push('', '**Further requirements:**', '', brief.extra.trim());
  return lines;
}

function taskIntro(ctx: Context): string {
  if (ctx.brief.task === 'extend')
    return 'The app already runs on MiniNode; its code is attached (or in `hosted/<slug>/` in the repository). Read all of it first. Add the features below and change nothing else: same data, same design, same texts, same behaviour. Table changes go into a new numbered file in `db/`; existing data must keep working.';
  if (ctx.brief.task === 'fix')
    return 'The app already exists; its code is attached (or in `hosted/<slug>/` in the repository). `mininode doctor` or the upload reported the findings below. Fix exactly these, with the smallest change that follows the reference, and change nothing else. Do not silence a check (no `kv-collection-ok` or similar markers) unless the reference allows it for that case.';
  return 'Build the app described below. Start with the most used view, keep one primary action per view, and make every list work empty, loading and full.';
}

function title(ctx: Context): string {
  const app = ctx.named ? ` "${ctx.name}"` : '';
  if (ctx.brief.task === 'extend') return `# Extend the MiniNode app${app}`;
  if (ctx.brief.task === 'fix') return `# Fix the check findings of the MiniNode app${app}`;
  return ctx.named ? `# Build the MiniNode app${app}` : '# Build a MiniNode app';
}

/** The reference blocks: spec, design system, language packages, app type and features. */
function reference(ctx: Context, lib: Library): string {
  const blocks = [
    `<platform_spec>\n${specText(lib)}\n</platform_spec>`,
    `<design_system>\n${designText(lib, ctx.brief.short)}\n</design_system>`,
    `<language_packages>\n${guideText(lib.language, ctx.brief.short)}\n</language_packages>`,
  ];
  if (ctx.type) blocks.push(`<app_type id="${ctx.type.id}">\n${ctx.type.body}\n</app_type>`);
  for (const m of ctx.modules) blocks.push(`<feature id="${m.id}">\n${m.body}\n</feature>`);
  return blocks.join('\n\n');
}

function compactReference(ctx: Context, lib: Library): string {
  const skeleton = `<!doctype html>
<html lang="de" data-accent="${ctx.brief.accent}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title data-i18n="app.title">${ctx.name || 'App'}</title>
  <link rel="stylesheet" href="/_mininode/ui.css">
  <link rel="stylesheet" href="/app.css">
  <script src="/_mininode/ui.js"></script>
  <script src="/_mininode/i18n.js"></script>
  <script src="/_mininode/sdk.js" defer></script>
  <script src="/app.js" type="module"></script>
</head>
<body class="mn-app">
  <nav class="mn-nav" aria-label="Bereiche">
    <div class="mn-tabs">
      <button class="mn-tab" type="button" aria-current="page" data-i18n="nav.start">Start</button>
    </div>
  </nav>
  <div class="mn-page">
    <header class="mn-top"><div class="mn-top-inner">
      <div class="mn-top-text"><a class="mn-home" href="/" data-i18n="nav.allApps">Alle Apps</a><h1 data-i18n="view.start">Start</h1><p class="mn-sub"></p></div>
    </div></header>
    <main class="mn-main" id="view"></main>
  </div>
</body>
</html>`;
  const blocks = [
    `<sdk>\n${specSection(lib, 'The SDK')}\n\n${specSection(lib, 'Tables (the default for lists)')}\n</sdk>`,
    `<manifest>\n${specSection(lib, '`mininode.json`')}\n</manifest>`,
    `<html_skeleton>\nEvery app starts from this page. App Kit components: \`mn-btn\` (\`--primary\`, \`--ghost\`, \`--danger\`), \`mn-list\` with \`mn-row\` (\`mn-row-title\`, \`mn-row-sub\`, \`mn-row-side\`), \`mn-card\`, \`mn-empty\`, \`mn-sk\` (skeleton), \`mn-form\` with \`label.mn-field\`, \`mn-chips\` with \`mn-filter\`, \`mn-kpis\`; dialogs with \`mnui.sheet.open(node)\`, toasts with \`mnui.toast(text)\`, dates with \`mnui.date.format(iso)\`. In \`app.js\`: \`await mnI18n.ready; const mn = await window.mininode.mininode(); await mn.auth.requireLogin();\` and set the \`.mn-home\` link to \`mn.config.portalUrl\`.\n\n\`\`\`html\n${skeleton}\n\`\`\`\n</html_skeleton>`,
    `<language_packages>\n\`i18n/de.json\` and \`i18n/en.json\`: flat objects with the same keys, e.g. \`{ "app.title": "Bücher", "list.count": { "one": "{n} Buch", "other": "{n} Bücher" } }\` and \`{ "app.title": "Books", "list.count": { "one": "{n} book", "other": "{n} books" } }\`. Markup keeps the German text and names the key (\`data-i18n="app.title"\`); script uses \`mnI18n.t('list.count', { n })\`. German "du", plain British English.\n</language_packages>`,
  ];
  if (ctx.type) blocks.push(`<app_type id="${ctx.type.id}">\n${ctx.type.body}\n</app_type>`);
  for (const m of ctx.modules) blocks.push(`<feature id="${m.id}">\n${m.body}\n</feature>`);
  return blocks.join('\n\n');
}

function pointerPrompt(ctx: Context, lib: Library): string {
  const { brief } = ctx;
  const dir = ctx.named ? `hosted/${ctx.slug}/` : 'hosted/<slug>/';
  const lines: string[] = [title(ctx), ''];
  lines.push(
    `You work in the MiniNode repository. ${brief.task === 'new' ? `Build the app in \`${dir}\`.` : `The app is in \`${dir}\`.`} The specification is in the repository; read these files before you write code:`,
    '',
    '- `AGENTS.md` and `CLAUDE.md` (repository rules), `hosted/AGENTS.md` (rules for apps)',
    '- `docs/ai/NEW-APP-SPEC.md`, `docs/ai/DESIGN-SYSTEM.md`, `docs/ai/LANGUAGE-PACKAGES.md`',
  );
  if (ctx.type) lines.push(`- \`docs/ai/prompts/types/${ctx.type.id}.md\``);
  if (ctx.modules.length)
    lines.push(
      `- the feature modules ${ctx.modules.map((m) => `\`docs/ai/prompts/modules/${m.id}.md\``).join(', ')}`,
    );
  lines.push(
    '- an existing app with the same data mode as an example (`hosted/*/mininode.json`), e.g. `hosted/haushalt` (tables, language packages)',
    '',
    `## ${brief.task === 'fix' ? 'The findings' : 'The app'}`,
    '',
    taskIntro(ctx),
    '',
    ...briefSection(ctx),
    '',
    '## Decided already',
    '',
    `- Data mode \`${ctx.audience.mode}\`, accent \`${brief.accent}\`, German and English language packages.`,
    '- Static HTML with plain JavaScript modules (no build step) unless the app needs React; then Vite + React + TypeScript with `@mininode/sdk`.',
    '',
    '## Done means',
    '',
    `1. \`pnpm mininode doctor ${dir.slice(0, -1)}\` reports no error and no \`entity-collection-in-kv\`, \`stand-in-sdk\` or \`i18n-*\` finding; \`pnpm check\` passes.`,
    `2. An e2e test \`e2e/${ctx.slug || '<slug>'}.spec.ts\` does the main action and passes (\`pnpm e2e ${ctx.slug || '<slug>'}\`).`,
    '3. The app has a README; `docs/wiki/neuigkeiten.md` has a dated line about it (CLAUDE.md, "Knowledge").',
    '4. Commit with Conventional Commits on your branch and open a draft pull request. Show the output of the checks in your summary.',
    '',
    `Work through it without asking for a plan approval. ${hardRules(brief, lib).at(-2)} If something blocks you, stop and report what you tried.`,
  );
  return `${lines.join('\n')}\n`;
}

export interface Composed {
  /** What the owner pastes into the tool. */
  prompt: string;
  /** The reference as its own file (MININODE-REFERENCE.md), for tools that take attachments. */
  reference: string | null;
  /** The rules block for a tool's project knowledge field (Bolt), at most about 6000 characters. */
  knowledge: string | null;
}

export function compose(brief: Brief, lib: Library): Composed {
  const ctx = context(brief, lib);
  const out = ctx.builder.output;
  const rules = hardRules(brief, lib);
  const ref = out === 'compact' ? compactReference(ctx, lib) : reference(ctx, lib);
  const refFile = `# MiniNode reference\n\nThe specification for building apps on MiniNode: platform, design system, language packages, the kind of app and its features. Read all of it before you start.\n\n${ref}\n`;
  if (out === 'pointer')
    return { prompt: pointerPrompt(ctx, lib), reference: null, knowledge: null };

  const lines: string[] = [title(ctx), ''];
  lines.push(
    out === 'split'
      ? 'You build a web app for MiniNode, a private platform that hosts small apps in German and English behind one login. The specification is the attached file `MININODE-REFERENCE.md`; read it completely first. This message holds the task, how to build and deliver, the hard rules and a checklist.'
      : 'You build a web app for MiniNode, a private platform that hosts small apps in German and English behind one login. First comes the reference, each part in its own tag (platform spec, design system, language packages, the kind of app, its features). After it come your task, how to build and deliver, the numbered hard rules and a checklist. Read everything before you start.',
  );
  if (out !== 'split') lines.push('', ref);
  lines.push(
    '',
    out === 'split' ? '## Your task' : '## Your task (based on the reference above)',
    '',
    taskIntro(ctx),
    '',
    ...briefSection(ctx),
  );
  lines.push('', '## How to build and deliver', '', ctx.builder.text);
  lines.push('', '## Hard rules', '', ...rules.map((r, i) => `${i + 1}. ${r}`));
  lines.push('', '## Before you hand it over', '', ...checklist(ctx).map((c) => `- ${c}`));
  lines.push(
    '',
    'The reference and these rules agree with each other. If something still seems to conflict, the hard rules win, then the brief; say so in your summary.',
  );
  const prompt = `${lines.join('\n')}\n`;
  const knowledge =
    brief.builder === 'bolt'
      ? `MiniNode project rules (keep them in every answer). The specification is MININODE-REFERENCE.md in the project.\n\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`
      : null;
  return { prompt, reference: out === 'split' || ctx.starter ? refFile : null, knowledge };
}

export interface StarterFile {
  path: string;
  content: string;
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );

/** Marks files of the starter package that the upload removes again. */
export const STARTER_MARK = '<!-- mininode-starter: removed on upload -->';

/**
 * The starter package for tools outside the repository: the App Kit and the preview SDK under
 * `_mininode/`, empty language packages, a manifest, a page skeleton, the rules (AGENTS.md) and the
 * reference. Paths follow the builder's layout (static root or Vite `public/`).
 */
export function starterFiles(brief: Brief, lib: Library, composed: Composed): StarterFile[] {
  const ctx = context(brief, lib);
  const layout = ctx.builder.layout ?? 'static';
  const base = layout === 'vite' ? 'public/' : '';
  const name = escapeHtml(ctx.name || 'Neue App');
  const manifest = {
    $schema: 'https://mininode.app/schema/mininode.json',
    specVersion: 1,
    slug: ctx.slug || 'bitte-waehlen',
    name,
    description: '',
    kind: layout === 'vite' ? 'spa' : 'static',
    target: 'cloudflare',
    i18n: { languages: ['de', 'en'], default: 'de' },
    access: { default: true },
    data: { mode: ctx.audience.mode },
    ...(layout === 'vite' ? { build: { command: 'pnpm build', output: 'dist' } } : {}),
  };
  const de = { 'app.title': name, 'nav.allApps': 'Alle Apps', 'nav.start': 'Start' };
  const en = { 'app.title': name, 'nav.allApps': 'All apps', 'nav.start': 'Start' };
  const head = `<!doctype html>
<html lang="de" data-accent="${brief.accent}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title data-i18n="app.title">${name}</title>
  <link rel="stylesheet" href="/_mininode/ui.css">
  <script src="/_mininode/ui.js"></script>
  <script src="/_mininode/i18n.js"></script>
  <script src="/_mininode/sdk.js"></script>`;
  const index =
    layout === 'vite'
      ? `${head}
</head>
<body class="mn-app">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`
      : `${head}
  <script src="/app.js" type="module"></script>
</head>
<body class="mn-app">
  <nav class="mn-nav" aria-label="Bereiche"><div class="mn-tabs"></div></nav>
  <div class="mn-page">
    <header class="mn-top"><div class="mn-top-inner">
      <div class="mn-top-text"><a class="mn-home" href="/" data-i18n="nav.allApps">Alle Apps</a><h1></h1><p class="mn-sub"></p></div>
    </div></header>
    <main class="mn-main"></main>
  </div>
</body>
</html>
`;
  const rules = hardRules(brief, lib);
  const agents = `${STARTER_MARK}
# Rules for this MiniNode app

This project is built for MiniNode. The full specification is \`MININODE-REFERENCE.md\`. These rules
always apply:

${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

\`${base}_mininode/\` holds the App Kit and a preview SDK so the app runs in this tool; MiniNode
serves the real files under the same paths and the upload removes this folder.
`;
  return [
    { path: `${base}_mininode/ui.css`, content: lib.kitCss },
    { path: `${base}_mininode/ui.js`, content: lib.kitJs },
    { path: `${base}_mininode/i18n.js`, content: lib.i18nJs },
    { path: `${base}_mininode/sdk.js`, content: lib.previewSdk },
    { path: `${base}i18n/de.json`, content: `${JSON.stringify(de, null, 2)}\n` },
    { path: `${base}i18n/en.json`, content: `${JSON.stringify(en, null, 2)}\n` },
    { path: 'mininode.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: 'index.html', content: index },
    { path: 'AGENTS.md', content: agents },
    {
      path: 'MININODE-REFERENCE.md',
      content: `${STARTER_MARK}\n${composed.reference ?? ''}`,
    },
  ];
}

/**
 * Token estimates per model family: about 3.6 characters per token for GPT and Gemini on this mix
 * of English, German and code, and about a third more on Claude's current tokenizer.
 */
export const approxTokens = (text: string) => {
  const gpt = Math.round(text.length / 3.6);
  return { gpt, claude: Math.round(gpt * 1.35) };
};
