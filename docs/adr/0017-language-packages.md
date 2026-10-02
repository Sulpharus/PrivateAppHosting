# ADR 0017: Language switch and language packages

- Status: accepted
- Date: 2026-10-02

## Context

The platform speaks German everywhere. The owner wants each person to choose German or English
once, in their settings, and every app that has a matching language package to follow. New apps
built with AI must come with professional German and English texts, and the apps that exist today
get packages too.

## Decision

**One preference per person.** `platform.profiles.language` (`'de'` or `'en'`, default `'de'`).
The person can update only this column of their own row (column grant, like `display_name`). The
portal's Konto page has the switch ("Sprache / Language"); it writes the profile and the cookie
`mn-lang` (on the shared domain, so every `*.mininode.app` app sees it). When the portal loads the
profile it mirrors it into the cookie again, so a new device follows the profile.

**Apps ship packages.** An app lists `"i18n": { "languages": ["de", "en"], "default": "de" }` in
`mininode.json` and ships `i18n/de.json` and `i18n/en.json` (build apps: `public/i18n/`). Keys are
`group.name` in camelCase, values plain text with `{name}` placeholders; a plural is an object
(`zero`, `one`, `other`). No HTML in values, no leading or trailing spaces.

**One runtime helper.** `/_mininode/i18n.js` (`packages/ui/kit/i18n.js`) reads the cookie, loads the
package of that language (and German as the fallback), and offers `window.mnI18n`:
`ready`, `t(key, params)`, `lang`, `locale` (`de-DE`/`en-GB` for `Intl`), `apply(root)`,
`onChange(cb)`. Markup keeps its German text and names the key (`data-i18n`, `data-i18n-attr`),
so a page still works without the script. An app without a package for the person's language stays
German; nothing breaks.

**Doctor checks packages.** `mininode doctor` errors on a missing or malformed package, a key used
in the code or markup but missing, a placeholder or plural form that differs between the languages,
empty values and stray spaces, and warns about texts that were not translated (identical in both
languages). The deploy refuses an app whose packages fail the errors.

**The kit follows the language too.** `ui.js` shows date parts (month names, labels) and `game.js`
its texts in the active language; the class names of the date parts stay German so existing styles
and tests keep working.

**Data stays as written.** What a person typed or an API returned is not translated. Defaults that
the app stores (a starting category, a log line) are written in the language active at the time;
where a stored default is shown, the app translates it by its id (Haushalt's starting categories).

**New apps.** `docs/ai/NEW-APP-SPEC.md` (and the generated short form) requires both packages in
every app; `docs/ai/LANGUAGE-PACKAGES.md` says how to write them (British English, informal "you"
in both languages, brand and app names stay, formats follow the locale). The KI-Werkstatt prompts
and the `integrate-app` skill carry the same rule.

Known limits: texts a person saved from an API or by default (Medialog's fallback genres and
creators, a Kalender reminder's title once scheduled) keep the language of the moment they were
written. Sportplaner's season labels ("Winter", "Sommer", "Kurs") are stored as markers and follow
the language. A dialog that is open during a language change is redrawn when it closes (Medialog
remounts the app at once, so unsaved editor input is lost).

## Not covered

- The portal itself (start page, Verwaltung, login) is still German; only the Konto language card is
  bilingual. It can get a package of its own later with the same helper.
- The gate's login and error pages are German.
- More than two languages: `LANGS` in the helper and the manifest schema list them in one place each.

## Consequences

- A new column and a column grant; pgTAP covers both (`supabase/tests/101_profile_language.test.sql`).
- Apps cost more to write and test: every visible text needs a key. The conversion of the existing
  apps is the template; `e2e/language.spec.ts` opens every app in English.
- Switching the language in another tab redraws open apps (`onChange`); apps with an open dialog
  redraw when it closes.
