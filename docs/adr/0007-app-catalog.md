# ADR 0007: App catalog on the start page

- Status: accepted
- Date: 2026-09-29

## Context

With more apps, one alphabetical grid no longer gives an overview. Users want to keep favourites
across devices and find apps by topic and by how often they use them. The admin wants to group
apps that work well together and to show useful external websites next to the hosted apps,
without hosting them.

## Decision

**Categories.**
- `platform.app_categories` holds nine preset categories, each with lower-case keywords:
  - Haushalt & Finanzen
  - Sport & Gesundheit
  - Kochen & Einkaufen
  - Familie & Freunde
  - Werkzeuge
  - Wissen & Lernen
  - Unterhaltung
  - Arbeit & Büro
  - Planung & Organisation
- A trigger on `platform.apps` sets `category_id` from the app's name and description. A keyword
  found in the name counts double; ties go to the category with the lower `position`.
  - This runs on insert, on every redeploy, and whenever the categories change.
  - Apps with `category_manual` are left alone.
- The admin fixes an app's category under Verwaltung → Apps (`admin_set_app_category`, audited).
  Choosing "Automatisch" goes back to the keywords.
- Under Verwaltung → Kategorien & Pakete the admin edits keywords and order, and adds or deletes
  custom categories.
- Everyone may read categories; only an admin with a recent sign-in may write them (RLS).

**Favourites and usage.**
- `platform.app_favorites` stores favourites per user. The rows are private (RLS on `user_id`)
  and only allowed for apps the user may open.
- Pins from before this change lived in `localStorage`. They move into the account on the first
  load.
- The portal counts every tile click through `record_app_open` (security definer, checks
  `has_grant`), sent with `fetch(…, { keepalive: true })` so it survives the navigation.
- The start page sorts by name, most used (the user's own counts), newest or oldest (`created_at`
  of the app), and filters by Alle, Favoriten, Geteilt and every category that has apps. The
  chosen order is remembered per browser.

**App sets ("Pakete").**
- `platform.app_sets` and `platform.app_set_items` are curated by the admin. They show on the
  start page above the tiles when no filter or search is active.
- Users only see the items of apps they may open (RLS), and sets with no such app are hidden.

**Link tiles.**
- A new app kind `link` with target `external` carries `link_url` (https). There is no Worker, no
  gate and no data.
- The tile opens the website in a new tab (`rel="noopener noreferrer"`) and is marked "Link".
- Access, favourites, categories and sets work as for any app.
- The admin adds or removes links under Verwaltung → Apps (`admin_save_link`, optionally granted
  to every user and to future users via `is_default`).
- The migration adds *ATT - Werkzeugkasten* (`https://att-allthetools.com`) for everyone.

**Whitelist apps.**
- `apps.whitelist` marks an app that only the admin and chosen people see. Such an app is never
  granted automatically: not at sign-up (`is_default` is forced off by a check) and not by
  "for all".
- Under Verwaltung → Apps → Zugriff, the admin switches an app to "Nur Whitelist" and picks the
  people. `admin_set_whitelist` keeps exactly those grants and removes all others.
- Switching back to "Freigegeben" keeps the grants; more people are added as before.
- The admin can still add someone explicitly outside the whitelist panel (an invite with the app,
  or the per-user grant dialog); both show up in the panel's list.
- Sets are visible to a user only when they hold at least one app that user may open, so the
  names of sets made of whitelist apps stay private.

**Admin writes.**
- Changes that must not silently do nothing go through security-definer functions:
  - deleting a category;
  - saving or deleting a set;
  - link tiles;
  - categories per app;
  - whitelist.
- With a sign-in older than ten minutes these raise 42501, and the portal asks for a quick
  re-authentication.
- Category inserts and updates use RLS; a violation raises there too.
- All of these changes are audited.
- Deleting a category sends its apps back to automatic categorisation, including apps the admin
  had assigned to it by hand.

## Consequences

- New apps land in a category without any manifest change. A wrong guess is fixed once by hand
  and stays fixed.
- "Meistgenutzt" only counts opens from the start page, not direct visits to an app's address or
  its installed PWA.
- Link tiles live only in the database, not in `hosted/`, so deploys and `mininode prune` ignore
  them (there is no Worker to prune). A hosted app cannot take a link tile's slug: the deploy
  stops with a clear message.
