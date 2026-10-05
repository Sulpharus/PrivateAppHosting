// What the wiki bundles from the repository. The portal's JavaScript is a public static asset, so
// the generated reference pages get only the few lines they show (titles, status, dates, the head
// of a workflow, the command list, a summary of each app), never whole ADRs, runbooks, workflows
// or manifests. The articles in docs/wiki are the content meant to be read and are bundled whole.
// Used by vite.config.ts (import ... ?wikihead) and by the wiki test.

/** The part of `source` that the reference pages need, by kind of file. */
export function trimForWiki(path: string, source: string): string {
  if (path.endsWith('/bin.ts')) {
    return /const USAGE = `mininode <command>\n[\s\S]*?`;/.exec(source)?.[0] ?? '';
  }
  if (path.endsWith('.md')) return source.split('\n').slice(0, 14).join('\n');
  if (/\.ya?ml$/.test(path)) {
    // Name, the header comment and the triggers: everything before permissions, env and jobs.
    const lines = source.split('\n');
    const end = lines.findIndex((line) =>
      /^(permissions|concurrency|env|jobs|run-name|defaults):/.test(line),
    );
    return lines.slice(0, end < 0 ? 40 : end).join('\n');
  }
  if (path.endsWith('mininode.json')) {
    try {
      const m = JSON.parse(source) as {
        slug?: string;
        name?: string;
        description?: string;
        kind?: string;
        target?: string;
        data?: { mode?: string };
        i18n?: { languages?: string[] };
        game?: unknown;
        ai?: { models?: unknown[] };
        google?: unknown;
        apis?: unknown[];
        suite?: { uses?: unknown[] };
      };
      // Markers instead of the real blocks: the page only says whether an app has them.
      return JSON.stringify({
        slug: m.slug,
        name: m.name,
        description: m.description,
        kind: m.kind,
        target: m.target,
        data: { mode: m.data?.mode },
        i18n: m.i18n?.languages ? { languages: m.i18n.languages } : undefined,
        game: m.game ? true : undefined,
        ai: m.ai?.models?.length ? { models: ['x'] } : undefined,
        google: m.google ? true : undefined,
        apis: m.apis?.length ? ['x'] : undefined,
        suite: m.suite?.uses?.length ? { uses: ['x'] } : undefined,
      });
    } catch {
      return '{}';
    }
  }
  return '';
}
