# Task: add the German and English language packages to an existing MiniNode app

You are adding language packages to an app that already runs on MiniNode (a private platform that
hosts small German-language apps behind one login). The app works today and shows its texts in one
language only (usually German, written straight into the code). After your change it follows the
person's language choice (German or English) and **nothing else about it changes**: same behaviour,
same data, same design, same features.

The rules for the packages (files, markup, script, writing style, glossary and the final checks) are
in the guide below. Follow it exactly. Where this task and the guide differ, the guide wins.

## The app

The app's code comes with this prompt: files attached or pasted below, or (when you work inside the
MiniNode repository) the folder `hosted/<slug>/`. If a file you need is missing, ask for it before
you guess. Read the whole app first: markup, scripts, components, the manifest `mininode.json`, and
every place that produces text.

## What to do

1. **Inventory every text a person can see or hear.** Look in: HTML text and attributes
   (`placeholder`, `title`, `alt`, `aria-label`), JSX and template strings, `alert()`, `confirm()`,
   `prompt()`, toasts, error and empty-state messages, button and menu labels, table headers, the
   document `<title>`, text built from pieces (`'Noch ' + n + ' Tage'`), default data the app creates
   for the person (starting categories, sample entries), texts passed to `mn.notify`/`mn.push`, and
   prompts sent to `mn.ai` that expect a written answer. Do **not** translate: what people typed
   themselves, data from other sources, code identifiers, brand and app names.
2. **Make the keys.** One key per sentence (never glue pieces), grouped by screen or feature
   (`list.empty`, `editor.saveError`), lower camel case with a dot, the same order in both files.
   Counts use plural forms (`one`/`other`), dates and numbers use placeholders filled with formatted
   values. Reuse one key for the same text everywhere.
3. **Write `i18n/de.json`** with the app's existing German texts, unchanged in wording (fix only an
   obvious typo, and say so). **Write `i18n/en.json`** as a professional translator who knows the
   product: meaning and tone, not word for word, British spelling, sentence case, the platform
   glossary of the guide. Same keys, same placeholders in both. Built apps (Vite and similar) keep
   the files in `public/i18n/`.
4. **Wire the code.** Static markup keeps its German text and gets `data-i18n="key"` (attributes:
   `data-i18n-attr="placeholder:key;aria-label:key"`). Script and components call
   `window.mnI18n.t('key', { n })`; wait for `await window.mnI18n.ready` once before the first
   render, and re-render on `mnI18n.onChange`. Load `/_mininode/i18n.js` after `/_mininode/ui.js`
   and before the app's own scripts. Replace hard-coded `'de-DE'` and fixed date or money formats by
   `mnI18n.locale`, `Intl` and `mnui.date.format`. Texts that were stored as defaults are translated
   by their id where they are shown.
5. **Declare it** in `mininode.json`: `"i18n": { "languages": ["de", "en"], "default": "de" }`.
6. **Keep everything else.** Do not refactor, rename, restyle or "improve". Existing tests that look
   for German text keep working, because the markup still contains the German text. If a test checks
   a text that is now produced by script, it still sees the German text with a German profile.

## Check your work

- `pnpm mininode doctor hosted/<slug>` reports no `i18n-*` finding (both files exist, same keys, same
  placeholders, complete plural forms, every key used in the source exists, nothing untranslated
  except names). Run it if you can run commands; otherwise say clearly that you could not.
- Search the source for text literals that are left: quotes and JSX text in components,
  `alert(`, `confirm(`, `placeholder=`, `title=`, `aria-label=`.
- Open the app in German and English (`document.cookie = 'mn-lang=en; path=/'` and reload): every
  screen, dialog, empty state, error and toast; no key shown instead of a text; plurals for 0, 1, 2
  and 21; long texts fit at 360 px.

## Deliver

1. The changed and new files in full (or as a patch), including `i18n/de.json`, `i18n/en.json` and
   `mininode.json`.
2. A short list: how many keys, which files changed, texts you were unsure about (with the choice you
   made), texts you deliberately left alone (user data, names), and anything that needs a decision
   from the owner.
3. The result of the checks above, or which ones the owner has to run.

Do not add features, dependencies or build steps. Do not touch other apps.
