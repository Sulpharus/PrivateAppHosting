import { describe, expect, it } from 'vitest';
import {
  appsReference,
  commandsReference,
  decisionsReference,
  parseArticle,
  parseGuide,
  runbooksReference,
  searchArticles,
  sortArticles,
  workflowsReference,
} from './wikiLib.ts';

describe('parseArticle', () => {
  it('reads the front matter and the body', () => {
    const article = parseArticle(
      'rollen',
      '---\ntitle: Rollen\ncategory: einstieg\norder: 30\nsummary: Wer was darf\n---\n# Text\n',
    );
    expect(article).toMatchObject({
      slug: 'rollen',
      title: 'Rollen',
      category: 'einstieg',
      order: 30,
      summary: 'Wer was darf',
      generated: false,
    });
    expect(article.body).toBe('# Text\n');
  });

  it('survives a file without front matter', () => {
    expect(parseArticle('x', 'nur Text').title).toBe('x');
  });
});

describe('searchArticles', () => {
  const list = sortArticles([
    {
      slug: 'a',
      title: 'Sicherung',
      category: 'daten',
      order: 1,
      summary: 'Backup',
      body: 'Passphrase',
      generated: false,
    },
    {
      slug: 'b',
      title: 'Anmeldung',
      category: 'einstieg',
      order: 2,
      summary: 'Passkeys',
      body: 'Die Sicherung der Konten',
      generated: false,
    },
  ]);

  it('needs every word and ranks titles first', () => {
    expect(searchArticles(list, 'sicherung').map((a) => a.slug)).toEqual(['a', 'b']);
    expect(searchArticles(list, 'sicherung passkeys').map((a) => a.slug)).toEqual(['b']);
    expect(searchArticles(list, 'gibtesnicht')).toEqual([]);
    expect(searchArticles(list, '  ')).toHaveLength(2);
  });
});

describe('parseGuide', () => {
  it('turns every ## heading into a step', () => {
    const guide = parseGuide('Einleitung\n\n## Eins\n\nText eins\n\n## Zwei\n\nText zwei', (t) =>
      t.toLowerCase(),
    );
    expect(guide.intro).toBe('Einleitung');
    expect(guide.steps).toEqual([
      { id: 'eins', title: 'Eins', body: 'Text eins' },
      { id: 'zwei', title: 'Zwei', body: 'Text zwei' },
    ]);
  });
});

describe('reference pages', () => {
  it('lists apps from their manifests', () => {
    const md = appsReference([
      JSON.stringify({
        slug: 'rezepte',
        name: 'Rezepte',
        description: 'Essen | Plan',
        kind: 'spa',
        target: 'cloudflare',
        data: { mode: 'private' },
        i18n: { languages: ['de', 'en'] },
      }),
      'kein json',
    ]);
    expect(md).toContain('**1 Apps**');
    expect(md).toContain('`rezepte.mininode.app`');
    expect(md).toContain('Essen \\| Plan');
    expect(md).toContain('privat je Person');
    expect(md).toContain('de/en');
  });

  it('lists workflows with their triggers and purpose', () => {
    const md = workflowsReference({
      '.github/workflows/backup.yml':
        'name: Sicherung\n\n# A backup of all data. Second sentence.\n\non:\n  workflow_dispatch:\n    inputs: {}\n  schedule:\n    - cron: x\n\njobs: {}\n',
    });
    expect(md).toContain(
      '| `backup.yml` | Sicherung | workflow_dispatch, schedule | A backup of all data. |',
    );
  });

  it('lists the commands from the usage text', () => {
    const md = commandsReference(
      'const USAGE = `mininode <command>\n\n  doctor <app-dir> | --all          Check hosted apps\n  backup create --out <dir>         Copy data\n                                    into a folder\n`;\n',
    );
    expect(md).toContain('| `doctor <app-dir> \\| --all` | Check hosted apps |');
    expect(md).toContain('| `backup create --out <dir>` | Copy data into a folder |');
  });

  it('lists decisions and runbooks', () => {
    expect(
      decisionsReference({
        'docs/adr/0019-x.md': '# ADR 0019: Backups\n\n- Status: accepted\n- Date: 2026-10-05\n',
      }),
    ).toContain(
      '| [0019](https://github.com/Sulpharus/PrivateAppHosting/blob/main/docs/adr/0019-x.md) | Backups | accepted | 2026-10-05 |',
    );
    expect(
      runbooksReference({
        'docs/runbooks/README.md': '# Runbooks\n',
        'docs/runbooks/backups.md': '# Backups\n\nA full backup.\n',
      }),
    ).toContain(
      '| [Backups](https://github.com/Sulpharus/PrivateAppHosting/blob/main/docs/runbooks/backups.md) | A full backup. |',
    );
  });
});
