# MiniNode App Kit: design system for hosted apps

> Paste this file into the AI tool that builds the app, together with `NEW-APP-SPEC.md` and
> your app idea. Every app built with it looks and behaves like part of one suite.
> Source: `packages/ui/kit/` (`ui.css`, `ui.js`, live preview in `preview.html`), extracted
> from the reworked *Sportplaner*.

## 1. How an app uses the kit

On MiniNode every app gets the kit from its own gate, next to the SDK:

```html
<!doctype html>
<html lang="de" data-accent="green">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <link rel="stylesheet" href="/_mininode/ui.css">
  <script src="/_mininode/ui.js"></script>
  <script src="/_mininode/sdk.js" defer></script>
  <script src="/app.js" defer></script>
</head>
<body class="mn-app"> … </body>
</html>
```

- `ui.css` holds the tokens (light and dark), the fonts and every component. `ui.js` adds
  `window.mnui` (dialogs, toasts, theme). Both work with plain HTML and with React
  (`className="mn-btn mn-btn--primary"`).
- Put `class="mn-app"` on `<body>`. The base styles (font, colours, form fields) only apply
  inside it.
- Pick one accent per app with `data-accent` on `<html>`: `green` (default), `blue`,
  `violet`, `amber`, `rose` or `teal`. Nothing else changes between apps.
- **Built outside MiniNode** (Claude artifact, AI Studio): copy the content of
  `packages/ui/kit/ui.css` into a `<style>` block and `ui.js` into a `<script>`, and use the
  same classes. The fonts then fall back to system fonts, because `url(fonts/…)` only resolves
  on MiniNode; that is expected. `/integrate-app` swaps the copies for the two links above
  (`docs/ai/playbooks/common-steps.md`, step 7).
- App CSS only adds what the kit lacks. Colours, fonts, radii and spacing always come from the
  `--mn-*` tokens. Never write raw hex values or font names in app CSS.

## 2. Principles

1. **Calm and useful.** Neutral, slightly green-tinted greys, one accent colour, no gradients,
   no emoji in the UI, no decorative illustrations. The user's own photos and data are the
   colour.
2. **Content first.** Each screen has one job and one primary action. Summaries come before
   details: numbers, then lists, then settings.
3. **The same shell everywhere.** Bottom tab bar on phones and side navigation from 960 px.
   The header shows the view title, a one-line subtitle, optional tools and the add button.
4. **State is visible in form.** Chips, badges, checkmarks and filled or outlined dots show
   state, not only text or colour.
5. **Phone first, desktop proper.** Everything works from 360 px. On desktop the extra width is
   used for side-by-side panels, not for stretched single columns.

## 3. Tokens

All tokens are CSS custom properties on `:root`. Dark values apply automatically with
`prefers-color-scheme: dark`. `<html data-theme="light|dark">` forces a theme
(`mnui.theme.set('light'|'dark'|'system')` stores the user's choice).

### Colour roles

| Token | Light | Dark | Use |
|---|---|---|---|
| `--mn-bg` | `#f3f4f1` | `#0e1113` | page background, inputs |
| `--mn-surface` | `#ffffff` | `#171b1e` | cards, lists, dialogs, navigation |
| `--mn-surface-2` | `#eceee9` | `#1f2427` | secondary buttons, tracks, grouped fields, skeletons |
| `--mn-ink` | `#15191c` | `#eceff1` | text, selected day, active filter |
| `--mn-muted` | `#5b646c` | `#9ba4ab` | secondary text, labels, inactive icons |
| `--mn-line` | `#dde1db` | `#2a3034` | dividers between rows (decorative only) |
| `--mn-line-strong` | `#7e8882` | `#6b757c` | input, day-picker and filter borders (at least 3:1 on every surface) |
| `--mn-scrim` | `rgba(10,14,12,.5)` | `rgba(0,0,0,.62)` | behind dialogs |
| `--mn-shadow` | soft two-layer shadow | none | cards on the light background |
| `--mn-ok` / `--mn-ok-soft` | `#1f7a3a` / `#e2f1e6` | `#6fcf8c` / `#16301f` | done, paid, returned |
| `--mn-warn` / `--mn-warn-soft` | `#7a5600` / `#f6ecd2` | `#e3c35a` / `#33290f` | due soon, needs attention |
| `--mn-bad` / `--mn-bad-soft` | `#b42318` / `#f9e3e1` | `#f97066` / `#3a1a17` | errors, overdue, delete |

### Accents (`data-accent`)

Each accent has four tokens: `--mn-accent` (buttons, active marks), `--mn-accent-ink` (text on
the accent), `--mn-accent-soft` (tinted backgrounds, chips) and `--mn-accent-text` (accent-
coloured text and links). All pairs meet WCAG AA (4.5:1) in both themes.

Light: `--mn-accent-ink` is `#ffffff` for every accent.

| Accent | Light accent / text / soft | Dark accent / ink / soft / text | Suits |
|---|---|---|---|
| `green` | `#1c6a4f` / `#175a43` / `#e0ede6` | `#5cc49a` / `#0b1a14` / `#173229` / `#7fd6b1` | sport, health, household |
| `blue` | `#1f5fbf` / `#1a4f9e` / `#e1eaf8` | `#7fb0ff` / `#0a1628` / `#16263f` / `#a3c6ff` | office, calendar, tasks |
| `violet` | `#6a45b8` / `#5a3a9c` / `#ece5f8` | `#b79cff` / `#1a1030` / `#261d3d` / `#cbb8ff` | archive, books, films, learning |
| `amber` | `#8a5a00` / `#7a4f00` / `#f6ead2` | `#f0b949` / `#231802` / `#352710` / `#f5ca72` | finance, budget, contracts |
| `rose` | `#b3264f` / `#9c2045` / `#f8e1e8` | `#ff8fb0` / `#2a0a15` / `#3a1824` / `#ffadc5` | people, CRM, social |
| `teal` | `#0f6e78` / `#0c5d66` / `#dcefef` | `#5cc9d4` / `#061c1f` / `#12302f` / `#86d9e1` | travel, places, games |

Status colours are never used as the accent, and the accent never means "good" or "bad".

### Type

| Role | Token | Face |
|---|---|---|
| Display: titles, headings, numbers, tile names | `--mn-font-display` | Bricolage Grotesque, weight 650 to 700, tracking −0.01em |
| Text: body, labels, buttons | `--mn-font-text` | Instrument Sans, 400 body, 600 labels and buttons |
| Code, IDs, amounts in tables | `--mn-font-mono` | JetBrains Mono |

The fonts are self-hosted by the kit; never load Google Fonts.

| Step | Token | Size | Used for |
|---|---|---|---|
| xs | `--mn-fs-xs` | 12 | tab labels, badges, KPI captions on phones |
| sm | `--mn-fs-sm` | 14 | secondary text, labels, hints |
| md | `--mn-fs-md` | 16 | body, inputs (never smaller: iOS zooms) |
| lg | `--mn-fs-lg` | 18 | row and tile titles, dialog titles |
| xl | `--mn-fs-xl` | 22 | section headings, legends, KPI on phones |
| 2xl | `--mn-fs-2xl` | 28 | page title on phones |
| 3xl | `--mn-fs-3xl` | 34 | page title on desktop, detail title, big numbers |

Numbers that line up use `font-variant-numeric: tabular-nums` (class `mn-num`).

### Space, radius, layout

- Spacing steps: `--mn-s1` 4 · `s2` 8 · `s3` 12 · `s4` 16 · `s5` 20 · `s6` 24 · `s8` 32 ·
  `s10` 40 px. Sections are 32 px apart, fields in a form 16 px, related items 8 to 12 px.
- Radius: `--mn-r-sm` 8 (small marks) · `r-md` 12 (buttons, inputs, thumbnails) · `r-lg` 16
  (tiles, KPI cards) · `r-xl` 20 (lists, cards, dialogs). Pills and chips are fully round.
- Touch targets: `--mn-tap` 44 px minimum for everything clickable.
- Page gutter `--mn-gutter`: 16 px on phones, 24 px from 640 px, 40 px from 960 px. Content
  column `--mn-content` 1080 px. Side navigation `--mn-nav-w` 256 px.
- Breakpoints: 640 px (tablet: more tile columns, inline chips), 960 px (side navigation,
  dialogs centred, split layouts), 1200 px (four tile columns).

## 4. Dark mode

- Dark is a full theme, not an inversion. Surfaces get lighter as they come forward: `bg` →
  `surface` → `surface-2`. Cards have no shadow in dark mode; the surface step separates them.
- The accent gets lighter in dark mode, and the text on it becomes dark (`--mn-accent-ink`).
- Photos stay unchanged. Placeholders use `--mn-accent-soft` with `--mn-accent-text` initials.
- Never style a component inside a `@media (prefers-color-scheme)` or `[data-theme]` block. Use
  the tokens, and the kit switches them.
- Test every screen in both themes before handing over.

## 5. App shell

```html
<body class="mn-app">
  <nav class="mn-nav" aria-label="Bereiche">
    <div class="mn-brand">                         <!-- only visible from 960 px -->
      <a class="mn-home" href="https://mininode.app">Alle Apps</a>
      <span class="mn-brand-name"><span class="mn-brand-mark"><svg aria-hidden="true">…</svg></span>Bücherregal</span>
      <button class="mn-btn mn-btn--primary" type="button">Buch hinzufügen</button>
    </div>
    <div class="mn-tabs">                          <!-- 2 to 5 views -->
      <button class="mn-tab" type="button" aria-current="page"><svg aria-hidden="true">…</svg>Start</button>
      <button class="mn-tab" type="button"><svg aria-hidden="true">…</svg>Liste</button>
    </div>
  </nav>
  <div class="mn-page">
    <header class="mn-top"><div class="mn-top-inner">
      <div class="mn-top-text"><a class="mn-home" href="https://mininode.app">← Alle Apps</a><h1>Liste</h1><p class="mn-sub">23 Bücher</p></div>
      <div class="mn-top-tools"><!-- optional: year stepper, view switch --></div>
      <button class="mn-fab" type="button" aria-label="Buch hinzufügen"><svg aria-hidden="true">…</svg></button>
    </div></header>
    <main class="mn-main"> … </main>
  </div>
</body>
```

- The active tab has `aria-current="page"` (`mnui.select(button)` sets it).
- The "Alle Apps" link always points to `https://mininode.app`.
- `h1` names the view, not the app (the app name is in the side navigation). The subtitle adds
  one fact: a date, a count or a status. It never repeats information shown right below.
- Layout helpers inside `mn-main`: `mn-split mn-split--start` (fixed panel left, e.g. month
  grid plus day list), `mn-split mn-split--end` (content plus 300 px side panel, e.g. list plus
  backup), `mn-cols` (two equal columns from 960 px), `mn-sticky` for side panels.

## 6. Components

Every snippet below is complete; copy it and replace the content.

**Buttons.** `mn-btn` (secondary), `mn-btn--primary` (one per screen or dialog), `mn-btn--ghost`
(cancel), `mn-btn--danger` (delete), `mn-btn--block`; `mn-icon-btn` for icon-only buttons
(always with `aria-label`); `mn-link` for text actions in section headers; `mn-fab` for the
round add button in the header on phones.

```html
<button class="mn-btn mn-btn--primary" type="button">Speichern</button>
<button class="mn-icon-btn" type="button" aria-label="Nächster Monat"><svg aria-hidden="true">…</svg></button>
```

**Segmented control** (2 to 4 options; `aria-pressed`). **Filter chips** (`mn-filter` in
`mn-chips`; they scroll sideways on phones). **Status chips** (`mn-chip`, `--plain`, `--ok`,
`--warn`, `--bad`). **Stepper** for year or month.

```html
<div class="mn-seg" role="group" aria-label="Gruppieren nach">
  <button type="button" aria-pressed="true">Anbieter</button><button type="button" aria-pressed="false">Sportart</button>
</div>
<div class="mn-chips" role="group" aria-label="Genre">
  <button class="mn-filter" type="button" aria-pressed="true">Alle</button><button class="mn-filter" type="button" aria-pressed="false">Roman</button>
</div>
<span class="mn-chip mn-chip--warn">Fällig in 2 Tagen</span>
<div class="mn-stepper" role="group" aria-label="Jahr"><button class="mn-icon-btn" type="button" aria-label="Vorheriges Jahr"><svg aria-hidden="true">…</svg></button><b>2026</b><button class="mn-icon-btn" type="button" aria-label="Nächstes Jahr"><svg aria-hidden="true">…</svg></button></div>
```

**Section heading** with a count and an optional action:

```html
<div class="mn-sect"><h2>Am Lesen<small>3</small></h2><button class="mn-link" type="button">Alle anzeigen</button></div>
```

**Tiles**: for things with a photo (activities, books, places, recipes). The photo on top
(4:3), a solid caption band below, never text over a photo with a gradient. At most one badge
top left (time, progress) and one status bottom left (Erledigt, Beendet). The optional round
action (plan, favourite) sits in the caption's corner.

```html
<div class="mn-tiles">
  <div class="mn-tile-wrap">
    <button class="mn-tile" type="button">
      <span class="mn-tile-media"><img src="…" alt=""><span class="mn-tile-badge">17:00–22:00</span></span>
      <span class="mn-tile-cap"><span class="mn-tile-title">Bouldern</span><span class="mn-tile-sub">Klettern · Boulderwelt Ost</span></span>
    </button>
    <button class="mn-tile-action" type="button" aria-pressed="false" aria-label="Bouldern einplanen"><span><svg aria-hidden="true">…</svg></span></button>
  </div>
</div>
```

Without a photo, use `<span class="mn-tile-initials" aria-hidden="true">BO</span>` instead of
the image (decorative: the title below names the item).

**Lists**: for everything that is read and compared: rows with an optional 56 px thumbnail,
title, one line of detail and a right-aligned side value.

```html
<div class="mn-list">
  <button class="mn-row" type="button"><span class="mn-thumb">SR</span><span><span class="mn-row-title">Stiller</span><span class="mn-row-sub">Max Frisch, 1954, Roman</span></span><span class="mn-row-side"><b>★ 5</b>12. Aug</span></button>
  <div class="mn-row mn-row--text"><span><span class="mn-row-title">Lesekreis</span><span class="mn-row-sub">Kapitel 5 bis 7</span></span><span class="mn-row-side"><b>19:30</b>bis 21:00</span></div>
</div>
```

**Cards** (`mn-card`) group one self-contained block (backup, a chart). Never put cards inside
cards. **Facts** show label and value pairs in detail views; each pair is its own `div`:

```html
<dl class="mn-facts"><div><dt>Autor</dt><dd>Thomas Mann</dd></div><div><dt>Notiz</dt><dd>Ausgabe S. Fischer</dd></div></dl>
```

**Numbers**: `mn-kpis` with 2 to 4 `mn-kpi`, `mn-big` for one large amount, `mn-bar` rows
with `mn-meter` (width via `style="--mn-value:44"` in percent), `mn-heat` for a day grid
(`l1` to `l3` for intensity).

```html
<div class="mn-kpis"><div class="mn-kpi"><b>23</b><span>Bücher gelesen</span></div><div class="mn-kpi"><b>186,40 €</b><span>Ausgaben bisher</span></div></div>
<div class="mn-bar"><span class="mn-bar-top"><b>Roman</b><span>14 Bücher, 61 %</span></span><span class="mn-meter"><i style="--mn-value:61"></i></span></div>
```

**Dates**: the week strip holds two arrows, a range label (shown above the days on phones, so
every day keeps 44 px) and seven `mn-day` inside `.mn-week-days`. Classes `today` and `has`
(shows the dot), `aria-pressed="true"` for the selected day. Weeks start on Monday.

```html
<div class="mn-week">
  <button class="mn-icon-btn" type="button" aria-label="Vorherige Woche"><svg aria-hidden="true">…</svg></button>
  <span class="mn-week-label">28. Sept. bis 4. Okt.</span>
  <div class="mn-week-days">
    <button class="mn-day today has" type="button" aria-pressed="true" aria-label="Montag, 28. September"><small>Mo</small><b>28</b><i></i></button>
    <!-- … six more mn-day … -->
  </div>
  <button class="mn-icon-btn" type="button" aria-label="Nächste Woche"><svg aria-hidden="true">…</svg></button>
</div>
```

The month grid is a `mn-card` with `mn-cal-head` (arrows around an `h2`), a `mn-cal` row of
seven `mn-dow`, and a `mn-cal` of 35 or 42 `button.mn-cell` (day number, then `mn-dots` with
filled `<i>` for "available" and `<i class="o">` for "planned"; `out` for neighbouring months,
`today`, `aria-pressed` for the selected day).

**Empty state, loading and notices**:

```html
<div class="mn-empty"><div class="mn-empty-icon"><svg aria-hidden="true">…</svg></div><h3>Noch keine Wunschliste</h3><p>Merke dir Bücher, die du lesen möchtest.</p><button class="mn-btn mn-btn--primary" type="button">Buch merken</button></div>
<span class="mn-sk" style="height:56px"></span>
<div class="mn-banner mn-banner--warn" role="note">„Kleine Leute“ ist seit dem 12. September verliehen.</div>
<!-- also mn-banner (accent), mn-banner--ok, mn-banner--bad -->
<p class="mn-note">An diesem Tag ist nichts geplant.</p>
```

Every list has an empty state that says what goes there and offers the action that fills it.
While data loads, show skeletons in the shape of the content, not a spinner.

**Forms**: `mn-form` with `fieldset` and `legend`, `label.mn-field` wrapping each input,
`mn-grid-2` for two short fields side by side, `mn-hint` below a field, `mn-error` for
validation (`role="alert"`, and `aria-invalid="true"` on the field), `mn-checks` for checkbox
lists, `mn-daypick` for weekdays, `mn-group` for a tinted group of related fields,
`details.mn-more` for rarely used fields, and `mn-search` for a search field with its icon:

```html
<div class="mn-search"><svg aria-hidden="true">…</svg><input type="search" placeholder="Titel, Autor oder Genre" aria-label="Bücher durchsuchen"></div>
```

```html
<form class="mn-form" novalidate>
  <fieldset><legend>Buch</legend>
    <label class="mn-field">Titel<input name="title" required></label>
    <div class="mn-grid-2"><label class="mn-field">Autor<input name="author"></label><label class="mn-field">Jahr<input name="year" inputmode="numeric"></label></div>
    <p class="mn-hint">Das Cover lädst du im nächsten Schritt hoch.</p>
  </fieldset>
  <details class="mn-more"><summary>Verlag, ISBN und Notizen</summary><div>…</div></details>
  <p class="mn-error" role="alert" hidden></p>
</form>
```

**Dialogs (sheets)**: a bottom sheet on phones, a centred dialog on desktop. Open them with
`mnui.sheet.open(content, { tall, modal, onClose })`. It traps focus, makes the page behind
inert, closes on `Escape` and on the backdrop (not with `modal: true`, for unsaved forms),
returns focus to the opener and then calls `onClose`. Opening a second sheet closes the first
(with its `onClose`). Anything with `data-mn-close` closes it.

Pass a DOM node, e.g. a cloned `<template>` filled with `textContent`. An HTML string is
inserted as markup, so it must never contain unescaped user data (titles and notes of other
people in shared collections included).

```js
const sheet = document.querySelector('#tpl-detail').content.cloneNode(true);
sheet.querySelector('.mn-sheet-title').textContent = book.title;
mnui.sheet.open(sheet, { onClose: () => render() });
```

- Detail view: `mn-sheet-bar mn-sheet-bar--float` (close left, "Bearbeiten" right) over a 16:9
  `mn-sheet-hero` photo, then `mn-sheet-body` with the title (`h2.mn-sheet-title`), chips and
  `mn-facts`.
- Editor: `mn-sheet--tall` with `mn-sheet-bar` (Abbrechen · title · empty), for long forms
  `mn-steps` (3 to 4 steps, `aria-current="step"`, done steps get class `done`), the form in
  `mn-sheet-body`, and a sticky `mn-sheet-foot` with Zurück (ghost, left), a `mn-grow` spacer,
  Weiter (secondary) and one primary action. Saving works from every step; a validation error jumps to its step.
- Destructive actions sit at the bottom left of the footer or the end of the detail view and
  ask for a second tap ("Zum Löschen erneut tippen").

**Toast**: `mnui.toast('Buch gespeichert')` confirms every save, delete and import.

**Utilities**: `mn-muted` (secondary text colour), `mn-num` (tabular figures), `mn-sr-only`
(text for screen readers only), `mn-note` (a quiet line of muted text).

## 7. Screen patterns

| Screen | Build it from |
|---|---|
| Today / overview | week strip, then sections "Eingeplant" and "Weitere …" as tiles |
| Library / list | search, provider select and filter chips above a `mn-list`; backup as side panel |
| Calendar | segmented control (e.g. Angebote / Geplant) plus a month/list switch; `mn-split--start` with the month grid and the selected day's list |
| Statistics | year stepper in the header tools, KPIs, a heat grid, `mn-cols` with usage and cost bars, then the list of contracts or tariffs |
| Detail | sheet with photo, title, chips, a today box for the most likely action, then facts |
| Editor | tall sheet with steps; photos and name first, rarely used fields last and collapsed |
| Settings / backup | one `mn-card` per topic with its action buttons |

## 8. Copy

- German, informal "du", sentence case. Buttons say what happens: "Speichern", "Buch anlegen",
  "Exportieren", never "OK" or "Absenden".
- Toasts in the past tense: "Buch gespeichert", "Besuch eingetragen".
- Errors say what is wrong and how to fix it: "Gib ein gültiges Erscheinungsjahr an, z. B.
  1924." No apologies, no "Fehler!".
- Dates and numbers in German format: "Mo., 28. Sept.", "17:00–22:00", "1.234,50 €", "61 %".
- Empty states name what belongs there and how to add it.

## 9. Accessibility and motion

- Every interactive element is a real `button` or `a`, at least 44 px, with a visible focus
  ring: 2 px `--mn-accent` with a 2 px offset, at least 3:1 on every surface. Inputs show focus
  with an accent border and ring instead, plus a transparent outline for forced-colors mode.
  Never remove these in app CSS.
- Icon-only buttons have `aria-label`; decorative SVGs have `aria-hidden="true"`.
- Toggles use `aria-pressed`, the current tab `aria-current="page"`, the current step
  `aria-current="step"`.
- Colour is never the only signal: pair it with a label, an icon or a shape (filled vs outlined).
- Animations use only `transform` and `opacity` and switch off with
  `prefers-reduced-motion` (the kit does this for its own components).

## 10. Do not

- No gradients, glows, glassmorphism, emoji as icons or decoration, or stock illustrations.
- No text over photos without the solid caption band or a solid badge.
- No cards inside cards, no more than one primary button per view.
- No custom fonts, colours, radii or shadows outside the tokens.
- No full-screen spinners; use skeletons.
- No second navigation pattern (hamburger menus, top tabs) next to the app shell.

## 11. Checklist before handover

- [ ] `body.mn-app`, `data-accent` set, kit linked (or inlined outside MiniNode).
- [ ] Every view checked at 360 px, 768 px and 1280 px, in light and dark.
- [ ] Every list has an empty state and a loading skeleton.
- [ ] One primary action per view; dialogs close with Escape and restore focus.
- [ ] No raw colours or font names in app CSS.
