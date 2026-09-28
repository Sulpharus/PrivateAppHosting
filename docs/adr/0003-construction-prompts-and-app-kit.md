# ADR 0003: Construction prompts, app kit and the suite build order

- Status: proposed
- Date: 2026-09-28

## Context

New web apps are mostly written by AI tools (Claude, AI Studio) and then integrated by
`/integrate-app`. The more their structure already matches MiniNode, the less has to be
rebuilt, and the more they look and behave like one suite.

`docs/ai/NEW-APP-SPEC.md` is already a system prompt for that, but it has three gaps. It is a
single document, it knows nothing about shared suite data (ADR 0002), and it has no visual
design system. The look should follow the *Sportplaner* style, after that design has itself
been reworked.

## Decision

### 1. Construction prompt library ("Konstruktions-Prompts")

**Where the prompts live.** `docs/ai/prompts/` is the source of truth, versioned together with
the SDK. A prompt and the platform it describes change in the same PR.

**What each prompt file carries.** Every prompt is a Markdown file with front matter:

```yaml
id: suite-data
title: Gemeinsame Daten (Aufgaben, Termine, …)
requires: [base]
spec: 2
doctor: [suite-manifest, no-duplicate-types]
```

**Base prompt.** `base.md` is today's NEW-APP-SPEC, extended with the app kit rules below. It
covers the stack, the SDK, the manifest, login, storage, German UI and accessibility.

**Feature modules.** These are added to the base as needed:

| Module | Content |
|---|---|
| `suite-data` | using shared types, source keys, collections, handling `merged`/`rejectedFields` |
| `collaboration` | shared collections, realtime, presence, comments, conflict-free editing |
| `ai` | `mn.ai.chat/json/stream`, budgets, error messages |
| `media-files` | photos with EXIF time/place as `media` records, thumbnails, attachments |
| `tables` | own SQL tables via `db/*.sql`, when `mn.kv` is not enough |
| `import-export` | backups, CSV import, validation of foreign data |
| `notifications` | `mn.notify`, reminders |
| `maps-places` | `place`/`geo`, map view without external API keys |
| `finance` | cents, currencies, `transaction`/`contract`, tax fields |
| `games` | `game_profile`, `score`, leaderboards via shared collections |
| `port-existing` | porting Claude artifacts, AI Studio exports and foreign projects |

**Composer.** `mininode prompt base suite-data media-files` prints the combined prompt. The
admin dashboard offers the same, described next.

**Dashboard page.** *Verwaltung → Konstruktions-Prompts*:
- lists the library, which is bundled into the portal at build time and read-only;
- shows each module;
- composes a prompt from ticked modules, with *Kopieren* and *Herunterladen*;
- stores the admin's own additions, e.g. "Farben für Kinder-Apps", in
  `platform.prompt_snippets`, admin-only under RLS. These can be ticked like modules.

**Doctor.** Every rule a prompt states is checked by `mininode doctor` wherever it can be
checked mechanically, so a prompt and its enforcement cannot drift apart.

### 2. App kit (design system for apps)

**Order.** The Sportplaner design is reworked first, visually and structurally. The kit is
then extracted from it, so the kit starts from a proven app and not from a blank page.

**Visual work on Sportplaner:**
- Desktop layout with side navigation from 900 px, instead of a 760 px phone column.
- A clearer type scale and spacing rhythm.
- Replace the photo gradient scrim with a solid caption band. Gradients are against the UI
  rules.
- Consistent icons, tidied tile, list and sheet components, and loading skeletons.
- Better empty states, and dark mode contrast checked against WCAG AA.

**Structural work on Sportplaner:**
- Split the 2,500-line `app.js` into ES modules: state, schedule, views, editor, stats, backup.
- Split the nine-section editor into steps: Grundlagen → Zeiten → Teilnahme → Details. Rarely
  used fields go into expandable sections.

**What the kit contains:**
- Tokens: colour roles, type scale, spacing, radius and elevation, light and dark.
- Components as CSS classes plus small vanilla JS helpers that also work in React: app
  shell (header, tab bar or sidebar), sheet/dialog with focus trap, list row, tile, chips,
  segmented control, form fields, KPI card, meter, toast, empty state and skeleton.
- Standard patterns: week strip and calendar, search and filter row, backup section.

**How apps get it.** The gate serves the kit as `/_mininode/ui.css` + `/_mininode/ui.js`, like
the SDK, so apps pick up fixes on redeploy.

**Fonts.** Open decision: the platform uses Bricolage Grotesque / Instrument Sans, the
Sportplaner uses Barlow. The kit uses one family set for the whole suite; the choice is made
during the Sportplaner rework with side-by-side screenshots.

### 3. Build order

Each phase is its own PR, deployed and verified before the next one starts.

| Phase | Content | Done when |
|---|---|---|
| 1 | **App isolation:** `calling_app()` from `Origin`, retrofit to `app_kv` and app files | pgTAP proves app A cannot read app B's kv; e2e green |
| 2 | **Sportplaner redesign** (visual + structural) | screenshots approved by the admin |
| 3 | **App kit** extracted, served by the gate; Sportplaner, Haushalt and the test apps switched over | all apps look like one suite; doctor checks kit usage |
| 4 | **Suite core:** records, registry with stage 1 types, collections incl. shared ones, links, files, permissions with priority and merge, SDK `mn.suite` | pgTAP for every rule in ADR 0002 §4; SDK tests |
| 5 | **Verwaltung:** permission matrix, priority lists, overlap warnings, conflict log; collection management in *Dein Konto* | e2e: request → approve → read/write |
| 6 | **Prompt library** + dashboard page + `mininode prompt` | a new app built only from the composed prompt passes doctor unchanged |
| 7 | **First suite:** a new *Kalender* app (universal calendar and map), *Notizen* creating tasks | task from a note appears in the calendar |
| 8 | Stage 2 types with their apps: Haushalt ↔ Sportplaner (contracts, transactions, activities), media/trips, games | per type: two apps exchange data without duplicates |

## Consequences

- Every existing app is touched twice: once in phase 1 (isolation) and once in phase 3 (kit).
  Both are mechanical changes covered by the existing e2e tests.
- Prompts become part of the platform contract. Changing the SDK without updating the prompt
  fails review.
- The dashboard only shows prompts. Editing them goes through PRs, except for the admin's own
  snippets.
