# MiniNode language packages (German and English)

Every app ships its texts in two language packages. The person picks the language once in the
portal (*Konto → Sprache / Language*); every app that has the package follows, the others stay
German. **A package is part of the app, not an afterthought: build it while you write the UI.**

## 1. Files and manifest

- `i18n/de.json` and `i18n/en.json` next to `mininode.json` (static apps). Vite and other build
  apps keep them in `public/i18n/`, so the build copies them to `/i18n/`.
- Declare them in `mininode.json`: `"i18n": { "languages": ["de", "en"], "default": "de" }`.
- Both files are flat JSON objects: `"area.name": "Text"`. Keys are lower camel case with at least
  one dot (`list.empty`, `editor.saveError`, `nav.settings`), grouped by screen or feature, in the
  same order in both files. Both files have exactly the same keys.
- A value is a text, or an object of plural forms for a count: `"entries": { "one": "{n} entry",
  "other": "{n} entries" }`. Forms are `zero`, `one`, `two`, `few`, `many`, `other`; `other` is
  required. German and English need `one` and `other`.
- Placeholders are `{name}`: the same names in German and English. A number placeholder is
  formatted for the language automatically. Never put HTML, Markdown or line breaks into a text.

## 2. Using them

```html
<script src="/_mininode/ui.js"></script>
<script src="/_mininode/i18n.js"></script>   <!-- after ui.js, before your own scripts -->

<h1 data-i18n="app.title">Haushalt</h1>
<input data-i18n-attr="placeholder:search.placeholder;aria-label:search.label" placeholder="Suchen">
<title data-i18n="app.title">Haushalt</title>
```

- **Markup keeps the German text** (the app reads well without script) and names the key. An
  element with `data-i18n` gets its whole text replaced, so it must hold only that text.
  Attributes (`placeholder`, `aria-label`, `title`, `alt`) use `data-i18n-attr="attr:key;attr:key"`.
  Elements added later by script are translated automatically.
- **Texts made by script** use `mnI18n.t('list.count', { n: items.length })`. Wait for the
  packages once at start-up: `await window.mnI18n.ready;` before the first render.
- React: wrap it once, `const t = (key, params) => window.mnI18n.t(key, params);`, re-render on
  `window.mnI18n.onChange(() => forceRender())`, and call `t('key')` instead of writing text in
  the JSX. No text literal for people in components, titles, `aria-label`s, alerts, toasts or
  error messages.
- `mnI18n.lang` is `'de'` or `'en'` (German when the app has no English package); `mnI18n.locale`
  is `'de-DE'` or `'en-GB'` for `Intl.NumberFormat`, `Intl.DateTimeFormat` and `toLocale…`.
  Never hard-code `'de-DE'`. Dates in the interface use `mnui.date.format(iso)`, which follows the
  language ("01. Okt. 2026", "01 Oct 2026"). Money is `Intl.NumberFormat(mnI18n.locale,
  { style: 'currency', currency: 'EUR' })` ("1.234,50 €", "€1,234.50").
- Text that people typed themselves (titles, notes, names) and data from other sources is shown
  as it is, never translated.
- A prompt sent to `mn.ai` that expects a written answer says which language to answer in:
  `mnI18n.lang === 'en' ? 'Answer in English.' : 'Antworte auf Deutsch.'`.
- Offline: the browser keeps the packages it has loaded, so nothing special is needed.

## 3. Writing the texts (both languages)

Write German first, then the English as a professional translator who also knows the product:
**meaning and tone, not word for word**. Read the English aloud: if it sounds translated, rewrite.

- **Same meaning, same shape.** Each key says the same in both languages: no extra advice in one,
  no dropped warning. Keep the order of placeholders free: English may need them elsewhere.
- **Whole sentences, never glued.** Do not build a sentence from pieces
  (`'Noch ' + n + ' Tage'`): word order differs. One key per sentence with placeholders; use plural
  forms for counts ("1 entry", "2 entries"); never write "(s)".
- **Tone.** German: informal "du", friendly and direct. English: informal "you", plain, no slang,
  no exclamation marks except real success ("Saved." not "Saved!"). Be brief: a button is one or two
  words.
- **Spelling.** English is British (colour, organise, cancelled, "Sept" is written "Sep"); dates and
  times follow the language (24-hour clock in both). Plain quotes and apostrophes, no emoji.
- **Case.** German nouns are capitalised as usual. English uses sentence case for buttons, labels,
  headings and menu items ("Add entry", not "Add Entry"); proper names and product names stay.
- **Buttons are verbs** ("Save", "Add entry", "Delete"); navigation is a noun ("Settings"). Use the
  same word for the same thing everywhere, and the platform's words below.
- **Errors** say what happened and what to do, without blame or codes: "Could not load your
  recipes. Check your connection and try again." Empty states say what the screen is for and the
  one action: "No recipes yet. Add your first one."
- **Units, dates, numbers** are not part of the text: format them with `Intl`/`mnui.date`. A text
  with a date in it takes a placeholder (`"Due on {date}"`), filled with the formatted date.
- **Accessibility labels** are translated like visible text, and describe the action
  ("Delete recipe {name}").
- **Brand and product names** (MiniNode, Gaming Hub, Kalender, App names) are not translated.
  Platform names that already have an English form use it in English: Gaming Hub → Gaming Hub,
  Verwaltung → Admin, Konto → Account.
- **Text length.** English is often shorter than German but not always: check that buttons and
  table headers fit at 360 px in both languages.

Platform glossary (use exactly these):

| Deutsch | English |
| --- | --- |
| Speichern / Abbrechen / Löschen | Save / Cancel / Delete |
| Bearbeiten / Hinzufügen / Entfernen | Edit / Add / Remove |
| Neu / Fertig / Zurück / Weiter / Schließen | New / Done / Back / Next / Close |
| Suchen / Filter / Sortieren / Alle | Search / Filter / Sort / All |
| Heute / Morgen / Gestern / Woche / Monat / Jahr | Today / Tomorrow / Yesterday / Week / Month / Year |
| Einstellungen / Konto / Profil | Settings / Account / Profile |
| Rückgängig / Papierkorb | Undo / Bin |
| Laden … / Fehler / Erneut versuchen | Loading … / Error / Try again |
| Bestenliste / Spieler / Runde | Leaderboard / Player / Round |
| Einnahme / Ausgabe / Betrag | Income / Expense / Amount |
| Termin / Aufgabe / Erinnerung | Event / Task / Reminder |
| Teilen / Geteilt mit mir | Share / Shared with me |
| Favorit / Liste | Favourite / List |
| Anmelden / Abmelden | Sign in / Sign out |

## 4. Check before you hand over

- `pnpm mininode doctor hosted/<slug>` reports no `i18n-*` finding: both files exist, the keys
  match, placeholders match, plural forms are complete and every key the source uses exists.
  Treat an `i18n-untranslated` warning as a to-do: a sentence that is the same in both files was
  probably not translated (names and words like "OK" are fine).
- Open the app in German and in English (`document.cookie = 'mn-lang=en; path=/'` and reload):
  every screen, dialog, empty state, error and toast; no German left in English and no key shown
  instead of a text; plurals ("0", "1", "2", "21" entries); long English and German texts fit.
- No text literal for people is left in the source: search for quotes and JSX text in components
  and for `alert(`, `confirm(`, `placeholder=`, `title=`, `aria-label=`.
