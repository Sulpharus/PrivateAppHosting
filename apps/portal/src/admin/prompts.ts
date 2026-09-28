// Composes a full construction prompt for a new app from the library in docs/ai (ADR 0003 §1):
// the brief from the form, the app spec, the design system, one app type and any feature modules.

export interface PromptPart {
  id: string;
  title: string;
  summary: string;
  accent?: string;
  order: number;
  body: string;
}

export interface Library {
  spec: string;
  specShort: string;
  design: string;
  kitCss: string;
  types: PromptPart[];
  modules: PromptPart[];
}

export type Audience = 'me' | 'household' | 'group';
export type Builder = 'claude-artifact' | 'ai-studio' | 'claude-code' | 'other';

export interface Brief {
  name: string;
  idea: string;
  audience: Audience;
  builder: Builder;
  type: string;
  modules: string[];
  accent: string;
  extra: string;
  /** Use the short spec, for tools with small prompt limits. */
  short: boolean;
  /** Paste the kit CSS into the prompt instead of attaching ui.css. */
  embedKit: boolean;
}

export const ACCENTS: [string, string][] = [
  ['green', 'Grün'],
  ['blue', 'Blau'],
  ['violet', 'Violett'],
  ['amber', 'Bernstein'],
  ['rose', 'Rosé'],
  ['teal', 'Petrol'],
];

export const AUDIENCES: Record<Audience, { label: string; mode: string; note: string }> = {
  me: {
    label: 'Nur für mich (jede:r eigene Daten)',
    mode: 'private',
    note: 'Every user has their own private data.',
  },
  household: {
    label: 'Gemeinsam im Haushalt (eine gemeinsame Datenbasis)',
    mode: 'shared-account',
    note: 'Trusted users of the household work on the owner’s data together.',
  },
  group: {
    label: 'Für eine Gruppe (alle sehen alles)',
    mode: 'group',
    note: 'Everyone who has the app shares all data.',
  },
};

export const BUILDERS: Record<Builder, { label: string; text: string }> = {
  'claude-artifact': {
    label: 'Claude-Artifact (Chat)',
    text: `Build it as a Claude artifact: one React component (App.jsx) or one HTML file. The
MiniNode SDK does not exist inside the artifact, so put all persistence behind one small module
\`store\` with \`get(key)\`, \`set(key, value)\`, \`list(prefix)\`, \`delete(key)\` that uses
\`window.storage\` in the artifact; the integration swaps it for \`mn.kv\`. AI calls go through
\`window.claude.complete\` in the artifact and become \`mn.ai\` during integration. Style with
the App Kit classes (\`mn-*\`) and tokens (\`--mn-*\`), with the kit CSS pasted into a <style>
element (fonts fall back to system fonts in the artifact, that is expected). No Tailwind.`,
  },
  'ai-studio': {
    label: 'Google AI Studio',
    text: `Build it as a Vite + React + TypeScript project and deliver a ZIP. Do not use an import map,
esm.sh or the Tailwind CDN. Link \`/_mininode/ui.css\`, \`/_mininode/ui.js\` and
\`/_mininode/sdk.js\` in index.html, and use \`window.mininode.mininode()\` or the
\`@mininode/sdk\` package for all data, files and AI. Never call Gemini directly and never read
an API key.`,
  },
  'claude-code': {
    label: 'Claude Code (direkt im Repository)',
    text: `Build it directly in the MiniNode repository as \`hosted/<slug>/\`, following CLAUDE.md:
static HTML with plain scripts (no build) unless the app needs React. Link \`/_mininode/ui.css\`,
\`/_mininode/ui.js\` and \`/_mininode/sdk.js\`. Add \`mininode.json\` and a README, run
\`pnpm mininode doctor hosted/<slug>\` and \`pnpm mininode dev hosted/<slug>\`, add an e2e test
under \`e2e/\`, and open a PR.`,
  },
  other: {
    label: 'Andere KI',
    text: `Build it as a static site or a Vite + React app, deliver a ZIP, and follow the spec below
exactly. Link \`/_mininode/ui.css\`, \`/_mininode/ui.js\` and \`/_mininode/sdk.js\`.`,
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
  return {
    id: meta.id ?? '',
    title: meta.title ?? meta.id ?? '',
    summary: meta.summary ?? '',
    ...(meta.accent ? { accent: meta.accent } : {}),
    order: Number(meta.order ?? 100),
    body,
  };
}

export function sortParts(parts: PromptPart[]): PromptPart[] {
  return [...parts]
    .filter((p) => p.id)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/** The spec with its short/long markers removed, or only the marked part for the short version. */
function specText(lib: Library, short: boolean): string {
  const text = short ? lib.specShort : lib.spec;
  return text.replace(/<!--[\s\S]*?-->\n?/g, '').trim();
}

export function compose(brief: Brief, lib: Library): string {
  const type = lib.types.find((t) => t.id === brief.type);
  const modules = lib.modules.filter((m) => brief.modules.includes(m.id));
  const audience = AUDIENCES[brief.audience];
  const builder = BUILDERS[brief.builder];
  const name = brief.name.trim() || 'Neue App';
  const slug = slugify(name) || 'neue-app';
  const accentLabel = ACCENTS.find(([id]) => id === brief.accent)?.[1] ?? brief.accent;

  const lines: string[] = [];
  lines.push(`# Build the MiniNode app "${name}"`);
  lines.push('');
  lines.push(
    'You are building a web app for MiniNode, a private platform that hosts small German-language apps behind one login. Read the whole prompt before you start. The app brief comes first, then how to build and deliver it, then the platform spec and the design system every app follows, then guidance for this kind of app and each requested feature. Where they differ, the brief wins over the guidance, and the spec and design system win over your own habits.',
  );
  lines.push('');
  lines.push('## 1. The app');
  lines.push('');
  lines.push(`- **Name:** ${name}`);
  lines.push(`- **Slug:** \`${slug}\` (it becomes https://${slug}.mininode.app)`);
  if (type) lines.push(`- **Kind of app:** ${type.title} (${type.summary})`);
  lines.push(`- **Who uses it:** ${audience.note} Data mode \`${audience.mode}\`.`);
  lines.push(`- **Accent:** \`data-accent="${brief.accent}"\` (${accentLabel}).`);
  if (modules.length)
    lines.push(`- **Features:** ${modules.map((m) => `${m.title} (${m.summary})`).join('; ')}.`);
  lines.push('');
  lines.push('**What it should do, in the owner’s words:**');
  lines.push('');
  const idea = brief.idea.trim() || '(No description given: ask before you start.)';
  lines.push(...idea.split(/\r?\n/).map((l) => `> ${l}`));
  if (brief.extra.trim()) {
    lines.push('');
    lines.push('**Further requirements:**');
    lines.push('');
    lines.push(brief.extra.trim());
  }
  lines.push('');
  lines.push('## 2. How to build and deliver it');
  lines.push('');
  lines.push(builder.text);
  lines.push('');
  lines.push(
    'The UI is German with the informal "du". Start with the most used view, keep one primary action per view, and make every list work empty, loading and full.',
  );
  lines.push('');
  lines.push('## 3. Platform spec');
  lines.push('');
  lines.push(specText(lib, brief.short));
  lines.push('');
  lines.push('## 4. Design system');
  lines.push('');
  lines.push(lib.design.trim());
  if (brief.embedKit || brief.builder === 'claude-artifact') {
    lines.push('');
    lines.push('### App Kit CSS (ui.css)');
    lines.push('');
    lines.push('```css');
    lines.push(lib.kitCss.trim());
    lines.push('```');
  }
  if (type) {
    lines.push('');
    lines.push('## 5. This kind of app');
    lines.push('');
    lines.push(type.body);
  }
  if (modules.length) {
    lines.push('');
    lines.push('## 6. Features');
    for (const m of modules) {
      lines.push('');
      lines.push(m.body);
    }
  }
  lines.push('');
  lines.push('## 7. Before you hand it over');
  lines.push('');
  lines.push(
    [
      `- \`mininode.json\` has slug \`${slug}\`, data mode \`${audience.mode}\`${modules.some((m) => m.id === 'ai') ? ', the AI models with a small monthly budget' : ''}${modules.some((m) => m.id === 'google') ? ', the `google` block with the least access the app needs' : ''}.`,
      `- \`<html lang="de" data-accent="${brief.accent}">\`, \`<body class="mn-app">\`, the App Kit shell (\`mn-nav\`, \`mn-top\`, \`mn-main\`).`,
      '- Every view checked at 360 px and 1280 px, in light and dark mode.',
      '- No localStorage for user data, no CDN scripts, no API keys, no raw colours or fonts in app CSS.',
      '- Every list has an empty state and a loading skeleton; every network call has an error message.',
      '- A README says what the app does, what it stores and how to try it.',
    ].join('\n'),
  );
  return `${lines.join('\n')}\n`;
}

/** Rough token count for the prompt-size hint (about 4 characters per token). */
export const approxTokens = (text: string) => Math.round(text.length / 4);
