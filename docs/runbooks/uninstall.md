# Uninstall an app

Verwaltung → Apps → **Löschen** next to the app (ADR 0020). Link tiles have "Entfernen" instead.

## What happens

1. The dialog wants the app's address typed again. "Auch alle Daten löschen" is ticked: that
   removes the data of all users in this app, its files, logo, grants and settings, and cannot be
   undone. Make a backup first if you may want them (Verwaltung → Sicherung, `backups.md`).
2. The app is offline immediately. The workflow *App löschen* deletes its Worker at Cloudflare and,
   with the data option, its database schema, files and registry entry.
3. A pull request *chore(<slug>): App entfernen* removes `hosted/<slug>`. **Merge it** (after the
   checks): until then a full deploy would bring the app back. If CI is red because something else
   still mentions the app (an e2e test, a document), fix that in the same pull request.

Without the data option the data stays and the app is only offline: deploy it again to bring it
back.

## Programs

- **App-Bibliothek** (Jellyfin and others): the container is stopped on the NucBox. Its data
  folder stays there until you delete it: `ssh nucbox`, then
  `sudo rm -rf /srv/mininode/apps/<slug>` (check the path with `ls /srv/mininode/apps` first).
- **Programs installed in the Windows VM** (uploaded .exe/.msi): only the registry entry goes.
  Uninstall the program inside the VM yourself.

## By hand

Actions → *App löschen* → Run workflow (slug, purge). Or on a computer with the keys:
`pnpm mininode uninstall <slug> --purge --env production` (needs `SUPABASE_SECRET_KEY`,
`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`). It can be run again if it stopped halfway.

## If it fails

The log of the workflow names the step. Every step can be repeated. A missing key
(`CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`) stops the run before anything is dropped.
