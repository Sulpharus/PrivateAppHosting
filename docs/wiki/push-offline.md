---
title: Benachrichtigungen, Push und Offline
category: daten
order: 60
summary: Glocke, Push aufs Handy, Erinnerungen, Apps ohne Internet und Apps in der installierten MiniNode-App
---

## Benachrichtigungen (ADR 0005)

- **Glocke** im Portal: `mn.notify(titel, text, pfad)` legt eine Meldung ab.
- **Push aufs Gerät:** unter *Dein Konto → Benachrichtigungen* schaltet jede Person Push **je Gerät** ein. Nur das Portal hat den Service Worker für Push; Apps
  fragen nie selbst nach der Erlaubnis. Ein geteiltes Gerät gehört der zuletzt angemeldeten Person; Abmelden schaltet Push dort ab.
- **Erinnerungen zu einer Zeit:** `mn.push.schedule({ key, at, title, body, path })` (gleicher `key` ersetzt; bis 500 je Person und App, bis 400 Tage voraus),
  `cancel`, `list`, `status`. Der Cron der API läuft jede Minute, gibt Fälliges in die Glocke und verschickt es an alle Geräte.
- Ein Tipp öffnet `https://<name>.{{domain}}<pfad>`; Links bleiben im System.

Einrichten: `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`node scripts/vapid-keys.ts`). Wechselst du sie später, muss jedes Gerät Push neu einschalten.

## Jede App ist eine installierbare App (PWA)

Das Gate liefert für jede App Manifest, Symbol und `pwa.js`/`sw.js` aus. Seiten und ungehashte Dateien werden **Netz zuerst** geladen (die
Zugriffsprüfung läuft online), gehashte Dateien aus dem Zwischenspeicher: eine App öffnet **offline**, sobald sie einmal online geöffnet wurde. Ausnahme: WebAssembly-Apps (die Craft-Apps) laden ihr großes Modul am Service Worker vorbei; offline starten sie nur, solange der Browser das Modul noch selbst zwischenspeichert.
Jedes Deploy stempelt eine neue Version, damit alte Zwischenspeicher verschwinden. **Du siehst eine Änderung nicht?** Meist ist es eine
zwischengespeicherte App-Version: neu laden oder die App neu öffnen.

## Apps in der installierten MiniNode-App (ADR 0032)

Installierst du nur MiniNode (das Portal) als App, zeigt Chrome bei jeder App, die du daraus öffnest, oben eine helle Leiste mit Name und
Adresse: Jede App hat ihre eigene Adresse (`<app>.{{domain}}`), und alles außerhalb der installierten App bekommt diese Leiste. Darum zeigt
das installierte Portal Apps selbst, unter `/a/<app>`: die App über den ganzen Bildschirm, ohne Leiste. Zurück geht es mit der
Zurück-Geste oder „Alle Apps“ in der App. Im normalen Browser-Tab ändert sich nichts. Anmeldung, Daten und Offline-Betrieb bleiben, wie sie
sind; Apps müssen nichts tun.

Links aus einer App auf das Portal, andere Apps oder fremde Websites gibt die App an das Portal weiter, das sie an der richtigen Stelle
öffnet. Fremde Websites öffnen wie bisher unter der (jetzt dunklen) Leiste von Chrome, außer du schaltest unter
[Verwaltung → Einstellungen](/admin/settings) **„Externe Seiten im eigenen Viewer“** ein: Dann öffnen sie in MiniNode mit einer eigenen,
schlichten Leiste (Zurück, Adresse, „Im Browser öffnen“, Schließen). Seiten, die sich nicht einbetten lassen (Google, GitHub, Banken, die
meisten sozialen Netzwerke), erkennt MiniNode vorher und öffnet sie automatisch wie bisher. Auf fremden Seiten im Viewer klappt eine
Anmeldung oft nicht; dafür ist „Im Browser öffnen“ da.

Warum nicht einfach die Leiste abschalten? Chrome bietet dafür `scope_extensions` an, auf Android aber nicht (und am Desktop nur für
höchstens 10 einzelne Adressen). Die Begründung steht in ADR 0032.

## Startbildschirm

Jede App öffnet mit demselben Startbildschirm: das MiniNode-Zeichen, der Name der App, ein Fortschrittsbalken (hell und dunkel,
deutsch oder englisch wie im Portal gewählt, keine Bewegung bei „Bewegung reduzieren“). Er steht schon im ersten Byte der Seite und
verschwindet, sobald die Person angemeldet ist und die App etwas zeigt, nach höchstens 20 Sekunden in jedem Fall. Bei langsamer
Verbindung erscheint nach 7 Sekunden ein Hinweis. Die Hintergrundfarbe passt zum Startbild des Betriebssystems (ADR 0005). Apps
müssen dafür nichts tun.

## Offline-Daten (`mn.kv`)

Das SDK hält eine lokale Kopie je App und Person (IndexedDB), schreibt Änderungen in eine Warteschlange und überträgt sie bei Verbindung;
`mn.offline.onSynced(callback)` meldet das. Apps bauen dafür weder eigene Service Worker noch eigenen Zwischenspeicher.
