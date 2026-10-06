---
title: Wo Daten liegen: Datenmodi, kv, Dateien und Tabellen
category: daten
order: 10
summary: Wie Apps Daten speichern und warum eine App nicht an Daten einer anderen kommt
---

Alle Daten liegen in **Supabase** (Datenbank und Dateispeicher), nie im Browser eines Geräts und nie bei der App selbst. Die Sicherheit
liegt in der Datenbank: Jede Tabelle hat **Zeilenschutz** (*Row Level Security*, RLS).

## Drei Wege, Daten zu speichern

| Weg | Wofür | Eigenschaften |
| --- | --- | --- |
| **Eigene Tabellen** (`hosted/<name>/db/*.sql`, per `mn.table`, für Abfragen `mn.db`) | **jede Liste von Einträgen** (Buchungen, Gegenstände, Pläne, Kontakte …) | Schema `app_<name>`; echte Spaltentypen, Pflichtfelder, Prüfregeln, Fremdschlüssel; **offline nutzbar** über `mn.table` (Änderungen werden später übertragen); Auswertungen und Summen auf dem Server per `mn.db` (online). Migrationen laufen beim Deploy (Produktion; Staging nur, wenn du den Deploy dafür von Hand startest) |
| `mn.kv` | **Einstellungen** und kleine Zustände | Schlüssel-Wert; privat je Person oder `shared` für alle mit der App; funktioniert offline |
| `mn.files` | Fotos, Belege, Anhänge | Dateispeicher je App; signierte Adressen (1 h); Grenze 50 MB je Datei |

Die Regel dahinter (ADR 0022): Listen sind Tabellen, kv ist für Einstellungen. `mininode doctor` warnt, wenn eine App je Eintrag einen
kv-Schlüssel anlegt (`entity-collection-in-kv`). Ältere Apps ziehen nach und nach um; die kv-Einträge bleiben zunächst als Sicherung stehen.

`localStorage` und IndexedDB sind für Nutzerdaten **verboten** (sie wandern nicht zwischen Geräten). Apps, die sie dennoch nutzen,
bekommen beim Einbau eine Schicht, die `localStorage` im Konto hält (`installLocalStorageSync`).

## Datenmodi (`data.mode`)

| Modus | Wer sieht was |
| --- | --- |
| `none` | die App speichert nichts |
| `private` | jede Person hat ihre **eigenen** Daten |
| `shared-account` | vertraute Personen (`trusted`) arbeiten mit dem Konto des Eigentümers; jede Änderung steht mit der echten Person im Protokoll. Die App braucht einen Admin als Besitzer |
| `group` | alle mit Freigabe teilen alles |
| `readonly` | alle mit Freigabe dürfen nur lesen |

Die Vorlagen für Tabellen (`platform.secure_table`) setzen die Zeilenschutz-Regeln passend zum Modus. Eine Selbstprüfung (pgTAP) schlägt
fehl, wenn eine Tabelle in einem `app_*`-Schema keinen Zeilenschutz hat oder eine Regel `platform.app_access('<name>')` nicht aufruft.

## Wie die Trennung funktioniert (ADR 0002)

1. Jede App hat ihre **eigene Adresse**. Browser setzen den `Origin`-Header selbst; Seitenskripte können ihn nicht fälschen.
2. Die Datenbankfunktion `platform.calling_app()` liest ihn und schlägt ihn in `platform.app_origins` nach (der Deploy trägt
   `https://<name>.mininode.app` ein).
3. Jede Regel prüft **Person und aufrufende App** (`platform.app_access(<name>)`): Freigabe vorhanden *und* die Anfrage kommt von dieser
   App. Das Portal hat keine App-Identität.

Grenzen: Die Trennung schützt vor fehlerhaften Apps, nicht vor feindlichen. Es laufen nur Apps, die du eingebaut hast.

## Weitere Regeln

- Nie etwas an `anon` vergeben (nicht angemeldet). Schlüssel nie in der App, nie im Repository, nie in `mininode.json`.
- Änderungen an Tabellen mit Daten folgen **Expand and Contract**: erst nullable Spalte anlegen, doppelt schreiben, nachfüllen, Lesen
  umstellen, dann alte Spalte entfernen. Indizes auf großen Tabellen `concurrently`.
- Migrationen einer App liegen unter `hosted/<name>/db/`; ihre Prüfsumme wird gespeichert, **bereits angewendete Dateien dürfen nicht mehr
  geändert werden** (neue Datei anlegen).
- Echtzeit: `mn.realtime` für Live-Updates; Datenbank-Änderungen per `postgres_changes` kommen bei App-Daten nicht an (Zeilenschutz
  kennt die App dort nicht).

## Daten sichern und wegbringen

[Sicherung](wiki:sicherung) (alle Daten), [Apps exportieren](wiki:apps-exportieren-releases) (nur Code, ohne Daten),
[App löschen](wiki:app-loeschen) (mit Daten).
