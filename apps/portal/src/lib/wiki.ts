// Wires the wiki's sources (the repository's own files, bundled at build time) into articles.
// The pure logic is in wikiLib.ts. Reference sources come trimmed (wiki-sources.ts): the bundle
// is a public static asset, so it holds the articles and a few lines of each repository file.

import { type Article, buildArticles } from './wikiLib.ts';

const raw = (modules: Record<string, unknown>) => modules as Record<string, string>;

const articles = raw(
  import.meta.glob('../../../../docs/wiki/*.md', { query: '?raw', import: 'default', eager: true }),
);
const manifests = raw(
  import.meta.glob('../../../../hosted/*/mininode.json', {
    query: '?wikihead',
    import: 'default',
    eager: true,
  }),
);
const workflows = raw(
  import.meta.glob('../../../../.github/workflows/*.{yml,yaml}', {
    query: '?wikihead',
    import: 'default',
    eager: true,
  }),
);
const bin = raw(
  import.meta.glob('../../../../packages/cli/src/bin.ts', {
    query: '?wikihead',
    import: 'default',
    eager: true,
  }),
);
const adrs = raw(
  import.meta.glob('../../../../docs/adr/*.md', {
    query: '?wikihead',
    import: 'default',
    eager: true,
  }),
);
const runbooks = raw(
  import.meta.glob('../../../../docs/runbooks/*.md', {
    query: '?wikihead',
    import: 'default',
    eager: true,
  }),
);

export const ARTICLES: Article[] = buildArticles({
  articles,
  manifests: Object.values(manifests),
  workflows,
  binSource: Object.values(bin)[0] ?? '',
  adrs,
  runbooks,
});

export function findArticle(slug: string | undefined): Article | undefined {
  return ARTICLES.find((article) => article.slug === slug);
}

/** The Startup-Guide is an article too (docs/wiki/startup-guide.md), shown on its own page. */
export const GUIDE_SLUG = 'startup-guide';
export const WIKI_ARTICLES: Article[] = ARTICLES.filter((article) => article.slug !== GUIDE_SLUG);
