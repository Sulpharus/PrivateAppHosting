# Sportplaner

Personal sports planner: a library of sports offers (times per weekday, seasons, single dates,
photos, provider, sign-up, costs), planned participation, visits marked as done, tariffs and
memberships, and a yearly statistic with heatmap, usage and cost per visit. Data is private per
user (`data.mode: private`). Static HTML, no build.

## Origin

Ported from a Claude artifact (`claude.ai/artifact/NALo6ADH5SFsmfWTRBDbTN`). The UI and
scheduling logic are unchanged. What changed:

- **Storage:** `localStorage` and the artifact `db` became `mn.kv`, with one key per activity
  (`act:<id>`) and per tariff (`plan:<id>`), so two devices saving different activities never
  overwrite each other. Data reloads when the tab becomes visible again.
- **Photos:** the artifact `assets` store became `mn.files` (`photos/<id>.jpg` plus a 640 px
  thumbnail `photos/<id>-klein.jpg`). Images are fetched with signed URLs and shown from `blob:`
  URLs, which also works under the gate's CSP. At most four load at once.
- **Fonts:** Bricolage Grotesque and Instrument Sans (the platform fonts) are self-hosted in
  `fonts/` (OFL) instead of Google Fonts.
- **Code:** plain classic scripts in `js/`, loaded in order by `index.html` and sharing one global
  scope: `core` (helpers, state, schedule), `views`, `detail`, `editor`, `actions`, `stats`,
  `backup`, `boot`. No build step.
- **Layout:** bottom tab bar on phones, side navigation from 960 px; sheets become centred
  dialogs on desktop. The activity editor is split into four steps (Grundlagen, Zeiten,
  Teilnahme, Details) and can save from any step.
- **CSP:** inline `onsubmit` handlers removed (the gate allows only `script-src 'self'`).
- **Fixes:** the statistics progress bars reused the `.bar` class of the sheet header, which
  squashed the header of every dialog; they are now `.meter`. Dialogs move focus in, trap Tab
  and return focus on close. Touch targets are at least 44 px. File inputs are reachable by
  keyboard. Links from imported data only open `http(s)` URLs, and imported dates are validated
  so a broken backup file cannot break the calendar or inject markup.
- **Removed:** the one-time thumbnail backfill for old artifact photos and the unused slot editor.

## Courses, cancelled sessions and the map

- **Kurs** (step *Zeiten*): start and end (or its length in weeks), training days and times. Every
  session is planned; single sessions can be dropped in the detail view.
- **Ausgefallen** marks a session that did not take place. It counts neither as attended nor as
  missed. *Statistik* shows attendance as attended out of planned sessions up to today.
- **Karte:** every activity whose address was checked appears as a pin, with filters (all, on
  offer today, planned). The map library is Leaflet 1.9.4 in `vendor/leaflet/`, because the gate
  allows scripts only from the app itself. Tiles load from `tile.openstreetmap.org` (`img-src
  https:`).
- **Address check:** saving a new or changed address looks it up with OpenStreetMap Nominatim,
  through the platform proxy (`apis` → `nominatim`, no key). An address that does not exist blocks
  saving; with several hits you pick one. Offline, the entry is saved and checked later: *Karte →
  Adressen prüfen* checks older entries one per second, as the Nominatim usage policy asks.

## In the Kalender

Planned sessions from a week ago to 90 days ahead are written as shared `activity` records
(`js/suite.js`, ADR 0002; source key `<activity>#<date>`), with time, place, sport and whether a
session was done or cancelled. Sessions no longer planned leave the Kalender; past ones stay.
It needs the admin's approval of `suite.uses` (Verwaltung → Gemeinsame Daten); until then the
Sportplaner works as before.

## Moving data over from the artifact

In the artifact: *Bibliothek → Datensicherung → Exportieren*. Here: *Bibliothek →
Datensicherung → Importieren* with that file. Activities, visits, tariffs and photos come
across; photos are stored again in `mn.files`.

## Check

Add an activity with a photo on the PC, open `sportplaner.mininode.app` on the phone and see it.
Mark it as done, then check *Statistik*.
