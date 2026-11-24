# Construction prompt library

Building blocks for the prompt composer in *Verwaltung → KI-Werkstatt* (ADR 0003 §1, ADR 0029).
The portal bundles these files at build time; change them here, in the same PR as the platform
feature they describe.

- `types/*.md`: one per kind of app (organisation, archive, finance, …). Suggests the accent,
  the audience (data mode), the feature modules, the views and the tables.
- `modules/*.md`: one per feature (photos, AI, calendar, push, offline, maps, …) or situation
  (rebuilding an existing app, large data, sensitive data, keyboard-heavy use). Adds the SDK
  calls, patterns and pitfalls for it.

Modules are listed in collapsible groups (`daten`, `anbindungen`, `teilen`, `offline`,
`qualitaet`, `spiele`, `server`); a new group is added to `MODULE_GROUPS` in
`apps/portal/src/admin/prompts.ts`. A test fails for a module with an unknown group.

Every file starts with front matter:

```yaml
---
id: files          # unique within its folder; the composer's key
title: Fotos und Dateien   # shown in the composer (German)
summary: Belege, Fotos und Anhänge in mn.files   # one line under the title (German)
when: Nimm das, wenn …     # tooltip: when to choose it, plain German, one or two sentences
accent: green      # types only: the suggested data-accent
audience: me       # types only: me | household | group | team | readonly | none
modules: tables, files      # types only: modules the composer preselects
order: 10          # sort order in the composer
group: daten       # modules only: the collapsible group (see MODULE_GROUPS in prompts.ts)
---
```

The body is Markdown written for the AI tool that builds the app (English, like
`NEW-APP-SPEC.md`). It never repeats the spec or the design system; it adds what is specific to
the type or feature.

Rules the test in `apps/portal/src/admin/prompts.test.ts` enforces, because a contradiction in the
composed prompt costs every model accuracy:

- Lists of entries are tables (`mn.table`, ADR 0022); never one kv key per entry.
- Dates, numbers and amounts follow the person's language (`mnI18n.locale`,
  `mnui.date.format`); never hard-code `'de-DE'`.
- Describe only what the platform does today (check the SDK and the gate before you promise it).

The composer puts together, in this order: the reference (spec, design system, language packages,
the type and the modules, each in its own tag), the task, the delivery steps of the chosen tool, the
numbered hard rules and a closing checklist. How each tool gets its prompt (one long prompt, a short
prompt plus `MININODE-REFERENCE.md`, a pointer into the repository, or a compact prompt for small
models) and the starter package are in ADR 0029.
