---
title: Rechnungen
category: apps
order: 79
summary: Rechnungen für Selbstständige in Deutschland und Österreich, mit QR-Zahlung, Mahnungen, Statistik und Jahresexport
---

**Rechnungen** (`rechnungen.<deine Domain>`) schreibt Rechnungen für Selbstständige in Deutschland und Österreich. Alles ist privat: Niemand sonst auf MiniNode sieht deine Kunden, Rechnungen oder Zahlungen. Wie es gebaut ist, steht in `hosted/rechnungen/README.md`.

## Erste Schritte

1. *Einstellungen → Firmendaten eintragen:* Name, Anschrift, Land (Deutschland oder Österreich), Steuernummer oder UID, IBAN, Logo, Nummernformat (Standard `RE-{YYYY}-{NNNN}`) und Standardtexte. Das Land bestimmt Steuersätze und Pflichtangaben.
2. *Bausteine:* deine Leistungen und Produkte mit Nettopreis, Einheit und Steuersatz (oder per CSV aus dem bisherigen Programm übernehmen).
3. *Rechnung erstellen:* Kunde, Positionen, Details (Daten, Zahlungsziel, Steuerart, Layout, Sprache), Prüfen. Fehlt eine Pflichtangabe (§ 14 UStG in Deutschland, § 11 UStG in Österreich), sagt die App, welche.

Zum Ausprobieren gibt es „Mit Beispieldaten ausprobieren“; die Beispiele sind markiert und lassen sich in einem Schritt entfernen.

## Ausstellen, stornieren, bezahlt

- **Ausstellen** gibt die fortlaufende Nummer, friert die Rechnung ein und speichert das PDF auf MiniNode (offline ausgestellt: sobald du wieder online bist).
- Ausgestellte Rechnungen werden nie gelöscht oder geändert, sondern **storniert**: Eine Stornorechnung mit eigener Nummer hebt sie auf.
- **Zahlungen** (auch Teilzahlungen) erfasst du in der Rechnung oder mit „Bezahlt“ in der Übersicht.
- Steuerarten: mit Umsatzsteuer, Kleinunternehmer (§ 19 UStG / § 6 Abs. 1 Z 27 UStG), Reverse Charge, innergemeinschaftliche Lieferung, Ausfuhr; der passende Hinweis steht auf der Rechnung.

## PDF, QR-Code und E-Mail

- Drei Layouts: **DIN 5008** (Anschrift im Fensterumschlag, Falzmarken), **Modern** und **Kompakt**, auf Deutsch oder Englisch, möglichst auf einer Seite.
- Mit IBAN trägt jede Rechnung einen **Zahlungs-QR-Code** (GiroCode/EPC), den Banking-Apps in Deutschland und Österreich lesen.
- **Per E-Mail senden** und **Zahlungserinnerung senden** gehen über dein Gmail. Dafür verbindest du Google einmal im Portal; die App fragt nur das Senden von Mails an (`gmail: write`).

## Erinnerungen

Ist das Zahlungsziel abgelaufen und das Geld nicht da, meldet die App das einmal in der Glocke und am Morgen danach als Push auf Handy und PC (ohne Beträge oder Namen). Beides schaltest du in den Einstellungen ab.

## Statistik und Jahresexport

*Statistik* zeigt je Geschäftsjahr (Beginn einstellbar) **netto in Rechnung gestellt (geschätzt)** und **brutto eingegangen (tatsächlich)**, je Monat, größte Kunden und Summen je Steuersatz. Der **Jahresexport** lädt ein ZIP mit allen Rechnungs-PDFs, dem Rechnungsausgangsbuch, den Zahlungseingängen und den Summen je Steuersatz (CSV) für die Steuererklärung; dazu gibt es einen druckbaren Jahresbericht.

## Gut zu wissen

- Rechnungen musst du aufbewahren (Deutschland 8 Jahre, Österreich 7 Jahre). Exportiere regelmäßig eine Sicherung (*Einstellungen → Sicherung exportieren*).
- E-Rechnungen (XRechnung, ZUGFeRD) erzeugt die App noch nicht; in Deutschland brauchen Rechnungen an Unternehmen sie ab 2027 bzw. 2028.
- Das Logo der Kachel ersetzt du jederzeit unter *Verwaltung → Apps → Logo hochladen*.
