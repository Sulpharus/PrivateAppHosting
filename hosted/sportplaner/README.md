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
- **Fonts:** Barlow and Barlow Condensed are self-hosted in `fonts/` (OFL) instead of Google Fonts.
- **CSP:** inline `onsubmit` handlers removed (the gate allows only `script-src 'self'`).
- **Fixes:** the statistics progress bars reused the `.bar` class of the sheet header, which
  squashed the header of every dialog; they are now `.meter`. Dialogs move focus in, trap Tab
  and return focus on close. Touch targets are at least 44 px. File inputs are reachable by
  keyboard. Links from imported data only open `http(s)` URLs, and imported dates are validated
  so a broken backup file cannot break the calendar or inject markup.
- **Removed:** the one-time thumbnail backfill for old artifact photos and the unused slot editor.

## Moving data over from the artifact

In the artifact: *Bibliothek → Datensicherung → Exportieren*. Here: *Bibliothek →
Datensicherung → Importieren* with that file. Activities, visits, tariffs and photos come
across; photos are stored again in `mn.files`.

## Check

Add an activity with a photo on the PC, open `sportplaner.mininode.app` on the phone and see it.
Mark it as done, then check *Statistik*.
