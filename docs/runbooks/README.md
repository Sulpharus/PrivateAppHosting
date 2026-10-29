# Runbooks

0. [getting-started.md](getting-started.md): which variant (Cloudflare, desktop, both) and what they share
1. [setup-cloudflare.md](setup-cloudflare.md): variant 1, Cloudflare + Supabase + GitHub, first deploy and first login
1. [setup-desktop.md](setup-desktop.md): variant 2, the whole platform on one computer in Docker (installer, daily use, backup, restore)
1. [setup-both.md](setup-both.md): variant 3, Cloudflare plus a home server
2. [nucbox-install.md](nucbox-install.md): the home server: plain Docker host on any Linux hardware, or Proxmox with Linux and Windows VMs; backups
3. [add-app.md](add-app.md): from ZIP in `inbox/` to a live app
4. [restore.md](restore.md): app data, database, Wine prefixes, Windows VM, whole box
5. [key-rotation.md](key-rotation.md): every secret, where it lives, how to rotate it
6. [kalender.md](kalender.md): approve the Kalender's data, Google Calendar sync, troubleshooting
8. [app-export.md](app-export.md): an app as its own GitHub project, without data or keys
7. [app-library.md](app-library.md): App-Bibliothek setup, installing Jellyfin, n8n and others, adding programs
9. [uploads.md](uploads.md): upload web apps from Verwaltung, script-first integration, AI review queue
10. [programs.md](programs.md): install programs on the PC/server from Verwaltung, large installers
11. [releases.md](releases.md): starter, cloud, PC/server and complete packages per version
12. [backups.md](backups.md): full backup from Verwaltung, password-protected, and how to restore it
13. [uninstall.md](uninstall.md): delete an app with its data from Verwaltung, programs, by hand

The knowledge base (concepts, how-tos, Startup-Guide) is the wiki in Verwaltung → Wissen, source `docs/wiki/`; runbooks are the operating procedures it links to.
