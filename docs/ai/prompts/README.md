# Construction prompt library

Building blocks for the prompt composer in *Verwaltung → KI-Werkstatt* (ADR 0003 §1). The
portal bundles these files at build time; change them here, in the same PR as the platform
feature they describe.

- `types/*.md`: one per kind of app (organisation, archive, finance, …). Suggests the accent,
  the views and the data shape.
- `modules/*.md`: one per feature (photos, AI, calendar, push, offline, …) or situation
  (rebuilding an existing app, large data, sensitive data, keyboard-heavy use). Adds the SDK
  calls, patterns and pitfalls for it.

Every file starts with front matter:

```yaml
---
id: files          # unique within its folder; the composer's key
title: Fotos und Dateien   # shown in the composer (German)
summary: Belege, Fotos und Anhänge in mn.files   # one line under the title (German)
accent: green      # types only: the suggested data-accent
order: 10          # sort order in the composer
---
```

The body is Markdown written for the AI tool that builds the app (English, like
`NEW-APP-SPEC.md`). It never repeats the spec or the design system; it adds what is specific to
the type or feature. The composer puts together: the brief from the form, `NEW-APP-SPEC.md`,
`DESIGN-SYSTEM.md`, the chosen type, the chosen modules and a closing checklist.
