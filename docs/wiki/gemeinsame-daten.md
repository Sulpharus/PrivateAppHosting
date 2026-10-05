---
title: Gemeinsame Daten (Suite) und Kalender
category: daten
order: 20
summary: Wie mehrere Apps Termine, Aufgaben und Verträge teilen, und was du dafür freigibst
---

Manche Daten gehören zu mehreren Apps: ein Termin aus dem Sportplaner soll im Kalender stehen, eine Vertragszahlung aus dem Haushalt auch. Dafür gibt es
die **gemeinsamen Daten** (die „Suite“, ADR 0002; Datentypen: `docs/suite/data-types.md`).

## Aufbau

- **Ein Datensatz-Speicher** `platform.records` für alle geteilten Typen (Termin, Aufgabe, Sporteinheit, Vertrag, Buchung …). Welche Typen es gibt,
  steht im Register `platform.record_types` (mit JSON-Schema, das die Datenbank prüft); neue Typen brauchen einen Registereintrag statt einer Migration.
- **Sammlungen** gruppieren Datensätze: jede Person hat persönliche Sammlungen („Meine Aufgaben“) und kann **geteilte** anlegen
  („Familienkalender“) mit Mitgliedern als Besitzer, Bearbeiter oder Betrachter.
- Wer einen Datensatz lesen darf, ist Mitglied seiner Sammlung **und** die aufrufende App hat das Recht für diesen Typ.
- **Löschen** geht in einen Papierkorb (30 Tage). Geschrieben wird nur über `suite_upsert` / `suite_delete` (Dubletten werden erkannt,
  Felder haben Priorität, Schema wird geprüft).

## Anfrage, Genehmigung, Priorität

1. Die App **fragt** im Manifest an (`suite.uses`: Typ, Zugriff `read` < `create` < `write` < `delete`, Begründung). Beim Deploy steht das
   als **offen**; ohne Genehmigung bekommt die App nichts.
2. Du **genehmigst** unter Verwaltung → **Gemeinsame Daten** (Matrix App × Datentyp). Du kannst weniger geben als angefragt (etwa nur `read`).
3. Schreiben zwei Apps dasselbe Feld, gewinnt die in der **Prioritätsliste** weiter oben (je Typ einstellbar). Die Tabelle lässt sich
   nach offenen Anfragen, Typ oder App sortieren und auf „nur noch offene“ filtern.

## Der Kalender

`hosted/kalender` zeigt eigene und geteilte Kalender plus alles Datierte anderer Apps (Quellen): Sportplaner (Typ `activity`, „Bearbeiten“),
Haushalt (Typ `contract`, „Bearbeiten“). Nach dem ersten Deploy genehmigst du:

- **Kalender:** Termine mit „Löschen“, die anderen Typen mit „Lesen“;
- **Sportplaner:** `activity` „Bearbeiten“; **Haushalt:** `contract` „Bearbeiten“.

Jede App schreibt ihre Datensätze beim nächsten Öffnen. Ohne Genehmigung zeigt der Kalender nichts und kann nicht speichern.
Weiteres (Wiederholungen, Erinnerungen, ICS, geteilte Kalender): Runbook `kalender.md`.

## Google Kalender

Der Kalender kann **in beide Richtungen** mit Google synchronisieren: siehe [Google](wiki:google) (ADR 0010).

## SDK

```ts
await mn.suite.type('event').upsert({ title, starts_at }, { sourceKey }); // schreiben
await mn.suite.range({ from, to });                                      // alles Lesbare im Zeitraum
await mn.suite.collections('kalender');                                  // Sammlungen
```
