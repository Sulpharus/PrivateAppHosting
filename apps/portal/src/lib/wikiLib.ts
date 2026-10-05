// The wiki (Verwaltung → Wissen): articles are Markdown files in docs/wiki, with front matter
//
//   ---
//   title: Rollen, Zugriff und Freigaben
//   category: einstieg
//   order: 30
//   summary: Wer was sehen und tun darf
//   ---
//
// Besides them, reference pages are generated from the repository itself (apps, workflows,
// commands, decisions, runbooks), so those lists cannot fall behind.

export interface Article {
  slug: string;
  title: string;
  category: string;
  order: number;
  summary: string;
  body: string;
  /** Generated from the repository, not written by hand. */
  generated: boolean;
}

export const CATEGORIES: { id: string; label: string; hint: string }[] = [
  { id: 'einstieg', label: 'Einstieg', hint: 'Was MiniNode ist und wie du dich zurechtfindest' },
  { id: 'apps', label: 'Apps', hint: 'Apps hinzufügen, bauen, verwalten und löschen' },
  { id: 'daten', label: 'Daten und Sicherheit', hint: 'Wo Daten liegen, Schlüssel, Sicherung' },
  { id: 'betrieb', label: 'Betrieb', hint: 'Verwaltung, Deploy, Server, Fehlerbehebung' },
  { id: 'entwicklung', label: 'Entwicklung', hint: 'Repository, Befehle, Tests, Arbeitsweise' },
  {
    id: 'referenz',
    label: 'Referenz (automatisch)',
    hint: 'Listen, die aus dem Repository entstehen',
  },
];

/** Reads the front matter (`key: value` lines between `---`) and the body. */
export function parseArticle(slug: string, raw: string): Article {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  const meta: Record<string, string> = {};
  if (match?.[1])
    for (const line of match[1].split(/\r?\n/)) {
      const at = line.indexOf(':');
      if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  return {
    slug,
    title: meta.title ?? slug,
    category: meta.category ?? '',
    order: Number(meta.order ?? 100),
    summary: meta.summary ?? '',
    body: (match ? match[2] : raw) ?? '',
    generated: false,
  };
}

export function sortArticles(articles: Article[]): Article[] {
  return [...articles].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'));
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

const REPO = 'https://github.com/Sulpharus/PrivateAppHosting';

// ---------- generated reference pages ----------

interface ManifestLike {
  slug?: string;
  name?: string;
  description?: string;
  kind?: string;
  target?: string;
  data?: { mode?: string };
  i18n?: { languages?: string[] };
  game?: unknown;
  ai?: { models?: string[] };
  google?: unknown;
  apis?: unknown[];
  suite?: { uses?: unknown[] };
  access?: { default?: boolean };
}

const DATA_MODE: Record<string, string> = {
  none: 'keine Daten',
  private: 'privat je Person',
  'shared-account': 'gemeinsames Konto',
  group: 'Gruppe',
  readonly: 'nur lesen',
};

/** The apps in hosted/, from their manifests. */
export function appsReference(manifests: string[]): string {
  const rows = manifests
    .flatMap((raw) => {
      try {
        return [JSON.parse(raw) as ManifestLike];
      } catch {
        return [];
      }
    })
    .filter((m) => m.slug)
    .sort((a, b) => (a.name ?? a.slug ?? '').localeCompare(b.name ?? b.slug ?? '', 'de'));
  const lines = [
    'Diese Liste entsteht beim Bauen des Portals aus den `mininode.json` aller Ordner unter `hosted/`: ' +
      'neue und gelöschte Apps erscheinen hier von selbst. Programme für PC/Server und Bibliotheks-Apps ' +
      'liegen nicht in `hosted/`; du siehst sie unter [Apps](/admin/apps).',
    '',
    `**${rows.length} Apps** im Repository.`,
    '',
    '| App | Adresse | Beschreibung | Art | Daten | Besonderes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const m of rows) {
    const extras = [
      m.game ? 'Spiel (Gaming Hub)' : '',
      m.ai?.models?.length ? 'KI' : '',
      m.google ? 'Google' : '',
      m.apis?.length ? 'externe APIs' : '',
      m.suite?.uses?.length ? 'gemeinsame Daten' : '',
      m.i18n?.languages?.length ? m.i18n.languages.join('/') : '',
    ].filter(Boolean);
    lines.push(
      `| ${cell(m.name ?? '')} | \`${m.slug}.mininode.app\` | ${cell(m.description ?? '')} | ${cell(`${m.kind ?? ''}, ${m.target ?? ''}`)} | ${DATA_MODE[m.data?.mode ?? 'none'] ?? cell(m.data?.mode ?? '')} | ${cell(extras.join(', '))} |`,
    );
  }
  return lines.join('\n');
}

/** The workflows in .github/workflows: name, triggers and the first comment lines. */
export function workflowsReference(files: Record<string, string>): string {
  const lines = [
    'Aus `.github/workflows/` erzeugt. Gestartet werden sie automatisch, von Verwaltung aus über die API, ' +
      'oder von Hand unter GitHub → Actions → Workflow → *Run workflow*.',
    '',
    '| Datei | Name | Auslöser | Wofür |',
    '| --- | --- | --- | --- |',
  ];
  for (const [path, source] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const file = path.split('/').pop() ?? path;
    const name = /^name:\s*(.+)$/m.exec(source)?.[1]?.replace(/^["']|["']$/g, '') ?? file;
    const onBlock = /^on:\s*\n((?:[ \t]+.*\n|\n)*)/m.exec(source)?.[1] ?? '';
    const triggers = [
      ...new Set(
        [...onBlock.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).filter((t): t is string => !!t),
      ),
    ];
    // The comment block right after `name:` says what the workflow is for.
    const comment: string[] = [];
    for (const line of source.split('\n').slice(1)) {
      if (line.startsWith('#')) comment.push(line.replace(/^#\s?/, ''));
      else if (line.trim() !== '') break;
    }
    const purpose = comment.join(' ').split(/(?<=\.)\s/)[0] ?? '';
    lines.push(
      `| \`${file}\` | ${cell(name)} | ${cell(triggers.join(', ') || '-')} | ${cell(purpose)} |`,
    );
  }
  return lines.join('\n');
}

/** The commands of `mininode`, from the usage text in packages/cli/src/bin.ts. */
export function commandsReference(binSource: string): string {
  const usage = /const USAGE = `mininode <command>\n\n([\s\S]*?)`;/.exec(binSource)?.[1] ?? '';
  const entries: { command: string; text: string }[] = [];
  for (const line of usage.split('\n')) {
    if (!line.trim()) continue;
    const start = /^ {2}(\S.*?)(?: {2,}(\S.*))?$/.exec(line);
    if (line.startsWith('   ') && entries.length > 0 && !/^ {2}\S/.test(line)) {
      const last = entries[entries.length - 1];
      if (last) last.text += ` ${line.trim()}`;
    } else if (start) entries.push({ command: start[1] ?? '', text: start[2] ?? '' });
  }
  return [
    'Aus der Hilfe von `pnpm mininode` erzeugt. Aufruf im Repository: `pnpm mininode <befehl>`.',
    '',
    '| Befehl | Was er tut |',
    '| --- | --- |',
    ...entries.map((e) => `| \`${cell(e.command)}\` | ${cell(e.text)} |`),
  ].join('\n');
}

/** The architecture decisions in docs/adr. */
export function decisionsReference(files: Record<string, string>): string {
  const rows = Object.entries(files)
    .map(([path, source]) => {
      const file = path.split('/').pop() ?? path;
      const title = /^# (?:ADR )?(\d{4})[:.] (.+)$/m.exec(source);
      return {
        file,
        number: title?.[1] ?? '',
        title: title?.[2] ?? file,
        status: /^- Status: (.+)$/m.exec(source)?.[1] ?? '',
        date: /^- Date: (.+)$/m.exec(source)?.[1] ?? '',
      };
    })
    .filter((row) => row.number)
    .sort((a, b) => a.number.localeCompare(b.number));
  return [
    'Jede nicht offensichtliche Entscheidung steht in einem ADR (*Architecture Decision Record*) unter `docs/adr/`. ' +
      'Die Liste entsteht aus den Dateien.',
    '',
    '| Nr. | Entscheidung | Stand | Datum |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (r) =>
        `| [${r.number}](${REPO}/blob/main/docs/adr/${r.file}) | ${cell(r.title)} | ${cell(r.status)} | ${cell(r.date)} |`,
    ),
  ].join('\n');
}

/** The runbooks in docs/runbooks. */
export function runbooksReference(files: Record<string, string>): string {
  const rows = Object.entries(files)
    .filter(([path]) => !path.endsWith('/README.md'))
    .map(([path, source]) => {
      const file = path.split('/').pop() ?? path;
      const title = /^# (.+)$/m.exec(source)?.[1] ?? file;
      const first =
        source
          .split('\n')
          .slice(1)
          .find((line) => line.trim() && !line.startsWith('#') && !line.startsWith('|')) ?? '';
      return { file, title, first };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));
  return [
    'Schritt-für-Schritt-Anleitungen für den Betrieb liegen als Runbooks unter `docs/runbooks/` (englisch). ' +
      'Die Liste entsteht aus den Dateien.',
    '',
    '| Runbook | Worum es geht |',
    '| --- | --- |',
    ...rows.map(
      (r) => `| [${cell(r.title)}](${REPO}/blob/main/docs/runbooks/${r.file}) | ${cell(r.first)} |`,
    ),
  ].join('\n');
}

export const GENERATED: { slug: string; title: string; summary: string; order: number }[] = [
  {
    slug: 'ref-apps',
    title: 'Apps im System',
    summary: 'Alle Apps aus hosted/ mit Adresse, Art und Daten',
    order: 10,
  },
  {
    slug: 'ref-workflows',
    title: 'Workflows',
    summary: 'Alle GitHub-Workflows und wofür sie da sind',
    order: 20,
  },
  {
    slug: 'ref-befehle',
    title: 'Befehle (mininode)',
    summary: 'Alle Befehle der Kommandozeile',
    order: 30,
  },
  {
    slug: 'ref-entscheidungen',
    title: 'Entscheidungen (ADR)',
    summary: 'Alle Architekturentscheidungen',
    order: 40,
  },
  { slug: 'ref-runbooks', title: 'Runbooks', summary: 'Alle Betriebsanleitungen', order: 50 },
];

export interface Sources {
  /** docs/wiki/*.md by path. */
  articles: Record<string, string>;
  /** hosted/<slug>/mininode.json contents. */
  manifests: string[];
  workflows: Record<string, string>;
  binSource: string;
  adrs: Record<string, string>;
  runbooks: Record<string, string>;
}

/** Hand-written and generated articles together. */
export function buildArticles(sources: Sources): Article[] {
  const written = Object.entries(sources.articles).map(([path, raw]) =>
    parseArticle((path.split('/').pop() ?? path).replace(/\.md$/, ''), raw),
  );
  const bodies: Record<string, string> = {
    'ref-apps': appsReference(sources.manifests),
    'ref-workflows': workflowsReference(sources.workflows),
    'ref-befehle': commandsReference(sources.binSource),
    'ref-entscheidungen': decisionsReference(sources.adrs),
    'ref-runbooks': runbooksReference(sources.runbooks),
  };
  const generated: Article[] = GENERATED.map((g) => ({
    slug: g.slug,
    title: g.title,
    category: 'referenz',
    order: g.order,
    summary: g.summary,
    body: bodies[g.slug] ?? '',
    generated: true,
  }));
  return sortArticles([...written, ...generated]);
}

/** Articles that contain every search word, best matches (title, summary) first. */
export function searchArticles(articles: Article[], query: string): Article[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return articles;
  return articles
    .map((article) => {
      const title = article.title.toLowerCase();
      const summary = article.summary.toLowerCase();
      const body = article.body.toLowerCase();
      let score = 0;
      for (const word of words) {
        const inTitle = title.includes(word);
        const inSummary = summary.includes(word);
        const inBody = body.includes(word);
        if (!inTitle && !inSummary && !inBody) return { article, score: -1 };
        score += (inTitle ? 10 : 0) + (inSummary ? 4 : 0) + (inBody ? 1 : 0);
      }
      return { article, score };
    })
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.article);
}

/** The steps of the Startup-Guide: every `## ` heading with the text below it. */
export interface GuideStep {
  id: string;
  title: string;
  body: string;
}

export function parseGuide(
  body: string,
  idOf: (title: string) => string,
): { intro: string; steps: GuideStep[] } {
  const parts = body.split(/^## /m);
  const intro = (parts[0] ?? '').trim();
  const steps = parts.slice(1).map((part) => {
    const newline = part.indexOf('\n');
    const title = (newline < 0 ? part : part.slice(0, newline)).trim();
    return { id: idOf(title), title, body: newline < 0 ? '' : part.slice(newline + 1).trim() };
  });
  return { intro, steps };
}
