// Keeps the wiki (docs/wiki) in step with the system. This test fails when something new is added to
// the system and nobody wrote it down: a Verwaltung page, an app or package folder, an ADR. It
// cannot tell whether a text is still true; that is up to whoever changes the system and to the
// review (docs/wiki/wissen-pflegen.md).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMarkdown, safeHref } from './markdown.ts';
import {
  type Article,
  buildArticles,
  CATEGORIES,
  GENERATED,
  parseGuide,
  type Sources,
} from './wikiLib.ts';

// The repository root: the folder with pnpm-workspace.yaml above wherever the tests run.
function findRoot(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return `${dir}/`;
    if (dirname(dir) === dir) throw new Error('pnpm-workspace.yaml not found');
  }
}
const root = findRoot();
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');
const files = (dir: string, extension: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(`${root}${dir}`)
      .filter((name) => name.endsWith(extension))
      .map((name) => [`${dir}/${name}`, read(`${dir}/${name}`)]),
  );

const sources: Sources = {
  articles: files('docs/wiki', '.md'),
  manifests: readdirSync(`${root}hosted`)
    .filter((name) => existsSync(`${root}hosted/${name}/mininode.json`))
    .map((name) => read(`hosted/${name}/mininode.json`)),
  workflows: files('.github/workflows', '.yml'),
  binSource: read('packages/cli/src/bin.ts'),
  adrs: files('docs/adr', '.md'),
  runbooks: files('docs/runbooks', '.md'),
};

const articles = buildArticles(sources);
const written = articles.filter((article) => !article.generated);
const everything = written.map((article) => `${article.title}\n${article.body}`).join('\n');

describe('the articles', () => {
  it('have complete front matter', () => {
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const article of written) {
      expect(article.slug, article.slug).toMatch(/^[a-z0-9-]+$/);
      expect(article.title.length, `${article.slug}: title`).toBeGreaterThan(2);
      expect(article.summary.length, `${article.slug}: summary`).toBeGreaterThan(5);
      expect(categories.has(article.category), `${article.slug}: category`).toBe(true);
      expect(Number.isFinite(article.order), `${article.slug}: order`).toBe(true);
      expect(article.body.trim().length, `${article.slug}: body`).toBeGreaterThan(100);
    }
  });

  it('do not share an order inside a category', () => {
    const seen = new Map<string, string>();
    for (const article of written) {
      if (article.slug === 'startup-guide') continue;
      const key = `${article.category}:${article.order}`;
      expect(seen.get(key), `${article.slug} and ${seen.get(key)} share ${key}`).toBeUndefined();
      seen.set(key, article.slug);
    }
  });

  it('only link to places that exist', () => {
    const slugs = new Set(articles.map((a) => a.slug));
    const main = read('apps/portal/src/main.tsx');
    const routes = new Set(['/admin']);
    for (const m of main.matchAll(/path: '([a-z][a-z0-9/:-]*)'/g)) {
      const path = m[1] ?? '';
      routes.add(`/admin/${path.replace(/\/:.*$/, '')}`);
      routes.add(`/admin/hardware/${path}`);
    }
    for (const article of written) {
      // Links inside code (examples of the syntax) are not links.
      const prose = article.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
      for (const m of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = m[1] ?? '';
        const href = safeHref(target);
        expect(href, `${article.slug}: link ${target} is not allowed`).not.toBeNull();
        const wiki = /^wiki:([a-z0-9-]+)/.exec(target);
        if (wiki) expect(slugs.has(wiki[1] ?? ''), `${article.slug}: ${target}`).toBe(true);
        if (target.startsWith('/admin'))
          expect(routes.has(target.replace(/#.*$/, '')), `${article.slug}: ${target}`).toBe(true);
      }
    }
  });

  it('render without raw HTML', () => {
    for (const article of written) {
      const { html } = renderMarkdown(article.body);
      expect(html, article.slug).not.toMatch(/<script|<iframe|<img|onerror=|javascript:/i);
    }
  });
});

describe('the Startup-Guide', () => {
  it('is a list of steps with a title and a text', () => {
    const guide = articles.find((a) => a.slug === 'startup-guide');
    expect(guide).toBeDefined();
    const { steps } = parseGuide(guide?.body ?? '', (title) => title);
    expect(steps.length).toBeGreaterThanOrEqual(8);
    for (const step of steps) expect(step.body.length, step.title).toBeGreaterThan(40);
    expect(new Set(steps.map((s) => s.title)).size).toBe(steps.length);
  });
});

describe('what has to be written down', () => {
  it('names every page of the Verwaltung', () => {
    const layout = read('apps/portal/src/admin/AdminLayout.tsx');
    const labels = [...layout.matchAll(/\['\/admin[^']*', '([^']+)'\]/g)].map((m) => m[1] ?? '');
    expect(labels.length).toBeGreaterThan(8);
    for (const label of labels)
      expect(everything, `Verwaltung "${label}" is in no wiki article`).toContain(label);
  });

  it('names every app and package folder of the platform', () => {
    for (const parent of ['apps', 'packages']) {
      for (const entry of readdirSync(`${root}${parent}`, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'node_modules') continue;
        expect(
          everything,
          `${parent}/${entry.name} is in no wiki article (ueberblick.md, repo-aufbau.md)`,
        ).toContain(`${parent}/${entry.name}`);
      }
    }
  });

  it('mentions every decision (ADR)', () => {
    for (const name of readdirSync(`${root}docs/adr`)) {
      const number = /^(\d{4})-/.exec(name)?.[1];
      if (!number) continue;
      expect(everything, `ADR ${number} (${name}) is in no wiki article`).toContain(
        `ADR ${number}`,
      );
    }
  });

  it('lists the recent changes (Neuigkeiten) with the latest decision', () => {
    const adrs = readdirSync(`${root}docs/adr`)
      .map((name) => /^(\d{4})-/.exec(name)?.[1])
      .filter((n): n is string => !!n)
      .sort();
    const latest = adrs[adrs.length - 1] ?? '';
    const news = written.find((a) => a.slug === 'neuigkeiten')?.body ?? '';
    expect(news, `Neuigkeiten does not mention ADR ${latest}`).toContain(`ADR ${latest}`);
  });
});

describe('the generated reference pages', () => {
  const byslug = (slug: string): Article => {
    const found = articles.find((a) => a.slug === slug);
    if (!found) throw new Error(slug);
    return found;
  };

  it('exist and are not empty', () => {
    for (const g of GENERATED) expect(byslug(g.slug).body.split('\n').length).toBeGreaterThan(5);
  });

  it('list every app, workflow and decision of the repository', () => {
    const apps = byslug('ref-apps').body;
    for (const name of readdirSync(`${root}hosted`))
      if (existsSync(`${root}hosted/${name}/mininode.json`))
        expect(apps, name).toContain(
          `\`${JSON.parse(read(`hosted/${name}/mininode.json`)).slug}.mininode.app\``,
        );
    const workflows = byslug('ref-workflows').body;
    for (const name of readdirSync(`${root}.github/workflows`))
      expect(workflows, name).toContain(`\`${name}\``);
    const decisions = byslug('ref-entscheidungen').body;
    for (const name of readdirSync(`${root}docs/adr`)) expect(decisions, name).toContain(name);
  });

  it('list the commands of the command line', () => {
    const commands = byslug('ref-befehle').body;
    for (const command of ['doctor', 'deploy', 'integrate', 'backup create', 'uninstall'])
      expect(commands, command).toContain(command);
  });
});
