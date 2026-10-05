# ADR 0021: Wiki and Startup-Guide in Verwaltung

- Status: accepted
- Date: 2026-10-05

## Context

Knowledge about MiniNode lived in `PLAN.md`, ADRs, runbooks and `docs/STATUS.md`: written in English,
for people who build the system, scattered, and not where the owner works. The owner wants a place in
Verwaltung with articles and instructions on how to work with the system, and wants it to stay current
whenever something new is added.

## Decision

- **Verwaltung gets a group "Wissen"** (above "Weitere Dashboards") with two pages: **Wiki**
  (`/admin/wiki`, `/admin/wiki/<article>`) and **Startup-Guide** (`/admin/guide`).
- **The articles are files**: `docs/wiki/*.md`, German, Markdown with front matter (`title`,
  `category`, `order`, `summary`). They are bundled into the portal at build time, like the prompt
  library of the KI-Werkstatt; every article links to its file on GitHub for editing. Categories:
  Einstieg, Apps, Daten und Sicherheit, Betrieb, Entwicklung, Referenz.
- **The Wiki** has search over title, summary and text, categories, a table of contents per article and
  links between articles (`wiki:<slug>`). **The Startup-Guide** is one file whose `## ` headings are
  steps of a checklist; what is done is kept in the browser (`localStorage`), with an overall progress.
- **Generated reference pages** (Referenz) are built from the repository itself, so they cannot go
  stale: apps (`hosted/*/mininode.json`), workflows (`.github/workflows`), commands (the usage text of
  `packages/cli/src/bin.ts`), ADRs and runbooks.
- **A small Markdown renderer** (`apps/portal/src/lib/markdown.ts`) escapes everything and produces
  only its own tags (headings, lists, tables, code, quotes, safe links). No Markdown library, no raw
  HTML, no script.
- **Keeping it current is a rule and a test.** `CLAUDE.md` requires every visible or operational change
  to update the wiki in the same commit (article, `neuigkeiten.md`, Startup-Guide, `fehlerbehebung.md`,
  and the AI specs when apps can use it); the `reviewer` subagent checks it. The test
  `apps/portal/src/lib/wiki.test.ts` fails in CI when a Verwaltung page is missing from
  `verwaltung-rundgang.md`, an `apps/*` or `packages/*` folder is not named (whole word) or an ADR is
  not mentioned as "ADR NNNN", when `neuigkeiten.md` does not name the latest ADR, when links, front
  matter, `order` values or guide step ids are broken, and when the generated pages miss an app,
  workflow or decision. Renderer safety (no raw HTML) is covered by `markdown.test.ts`.
- **The wiki is public static content**: it ships in the portal bundle, readable by anyone who can
  load the portal assets. Articles must never contain secrets. The generated reference sources are
  trimmed at build time (`?wikihead`, `apps/portal/wiki-sources.ts`) so the bundle does not carry whole
  workflow files or the CLI.
- Renaming a guide step changes its id, so its checkmark in the browser resets.

## Consequences

- New apps appear in the wiki without anybody writing anything (uploads that the script integrates
  automatically are not blocked by the test).
- The test guarantees that new parts are named somewhere; whether a text is still true remains the job
  of the author and the review.
- The wiki is part of the portal bundle (a lazy chunk, loaded only on these pages); a new article needs
  a deploy of the portal.
