# Medialog

A personal archive for books (novels, manga, manhwa, manhua, light novels, comics), audiobooks,
films, series and video games. It rates works from 1 to 10 stars and tracks progress: chapters,
volumes, pages, episodes and play time. It also keeps an activity calendar, reading and watch
lists with checklists, and can share lists and works with other MiniNode users.

It is a React/Vite SPA with Tailwind and uses the App Kit from the gate. Data is private per user
(`mn.kv`: `work:<id>`, `list:<id>`, `settings`), and cached search answers expire after two hours.

## Origin

The app is a Google AI Studio export ("medialog"), integrated with the `ai-studio` playbook. The
AI Studio agent had started an update and stopped before finishing it. This integration
completes that update.

### German titles in the online search (finished)

The agent had added `preferGermanTitles` and `germanTitle`, but used neither. German input
("Angriff auf Titan", "Der Herr der Ringe") was translated to English before searching, so only
English editions were found. Now:

- German input stays German for the providers that know German editions:
  - Google Books: German editions (`langRestrict=de`) first, then all languages.
  - Open Library: `lang=de`.
  - Gutendex: `languages=de,en`.
  - iTunes: the German store.
  - Steam: `l=german`.
  - TMDB: `de-DE`.
- Jikan, MangaDex and TVMaze are indexed in English or romaji, so they get the English
  translation. MangaDex is asked in both languages.
- German titles are taken from:
  - Jikan (`titles[type=German]`);
  - MangaDex (`altTitles.de`);
  - Google Books (`language=de`);
  - TMDB.

  The result then shows the German title, with the English or original title next to it and a
  "Deutsch" mark.
- Optionen → Online-Suche → "Deutsche Titel bevorzugen" switches this off. The setting is on by
  default and stored per user.

### Every button works, no sample data

- **Sharing:**
  - Removed: the fake user list (Jana, Felix, …) and the "Nutzer wechseln" switch.
  - Sharing uses the real people of the app (`mn.people()`). The recipients get a snapshot
    (without private notes) and see it under Listen → "Mit dir geteilt", where they can copy works into
    their own collection.
- **Search results:**
  - Removed: invented achievements for every game, guessed page counts (192/280/320), and
    placeholder creators ("Manga Studio", "TV Studio").
  - App Store games are labelled iOS/iPadOS instead of a console guessed from the search text.
- **Removed features:**
  - The localStorage fallback SDK, the JSON-LD/SEO block and `robots: index` (a private app).
  - The "Projekt-ZIP herunterladen" button, a development aid of AI Studio.
- **Settings:**
  - The theme uses the App Kit (remembered across MiniNode apps).
  - The accent colour is stored per user.
  - "Konto verwalten" links to the portal.
- **Covers:** uploaded covers are shrunk to 480 px JPEG instead of storing the original file.
- **Share dialog:** it is a real dialog (accessible name, Escape closes it, focus returns).

## Platform APIs (`apis` in mininode.json)

| id | Key | Used for |
|---|---|---|
| `tmdb`, `google-books` | host key under Verwaltung → API-Schlüssel | films and series; books |
| `jikan`, `mangadex`, `openlibrary`, `gutendex`, `tvmaze`, `itunes`, `steam` | none (`auth.type: none`) | only proxied: the gate's CSP allows no third-party calls, and Steam sends no CORS headers |

Until the admin enters the TMDB and Google Books keys, those two show "wird gerade
eingerichtet". The other APIs work right away.

## Open points

- Sharing a work or list writes a snapshot to `app_medialog.shares` (`db/001_shares.sql`, ADR
  0008). Only the chosen people can read it, and the sender comes from the database. Snapshots
  hold titles, ratings and progress, but no notes, history or photos. Shared lists are updated
  when their works change.
- Backup import keeps every field of the export and never overwrites an entry that changed here
  after the backup was made.
- The bundle is about 700 kB (one chunk). It could be split by view later.

## Tests

- `pnpm --filter @mininode-hosted/medialog test`: the German search, with the SDK faked.
- `e2e/medialog.spec.ts`: empty start, adding a work by hand, lists, and sharing with a second
  user.
