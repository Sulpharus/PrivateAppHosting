# App briefs

Ready-made briefs for apps the owner wants built. Each `*.brief.md` has a short front matter (name,
type, audience, accent, modules) and the brief in the owner's words. Turn one into the full
construction prompt (brief + platform spec + design system + the chosen feature modules + kit CSS)
for AI Studio, Claude or any other tool:

```bash
node scripts/compose-brief.ts docs/ai/briefs/projekte.brief.md > projekte.prompt.md
```

The prompt is composed from the current docs, so regenerate it after the spec changes. Verwaltung →
KI-Werkstatt builds the same kind of prompt from the form.
