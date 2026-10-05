---
title: Startseite, Schubladen und Gaming Hub
category: einstieg
order: 50
summary: Was Nutzer auf der Startseite sehen: Kacheln, Favoriten, Kategorien, Pakete, Schubladen
---

Die Startseite `mininode.app` zeigt jeder Person **die Apps, die sie öffnen darf** (ADR 0007).

## Kacheln

- Jede App ist eine **Kachel** mit Logo (oder Monogramm), Name und Beschreibung. Ein Klick öffnet die App
  (`<name>.mininode.app`). **Link-Kacheln** öffnen eine fremde Website in einem neuen Tab und sind als „Link“ markiert.
- **Favoriten:** der Stern an der Kachel; Favoriten gehören zum Konto und wandern mit auf andere Geräte.
- **Remote-Apps** zeigen ihren Zustand live (frei, belegt seit …).
- **Benachrichtigungen:** die Glocke oben; mit eingeschaltetem Push kommen sie auch aufs Handy ([Push](wiki:push-offline)).

## Ansicht, Sortieren und filtern

**Ansicht:** *Kacheln* (höchstens drei pro Reihe), *Groß* (große Logos), *Liste* (eine Zeile pro App) und *Kompakt* (nur Logo und Name). Die Wahl wird je Browser gemerkt.

Sortierung: Name, **meistgenutzt** (deine eigenen Zähler), neu, alt. Filter: Alle, Favoriten, Geteilt und jede Kategorie, in der
Apps liegen. Die Wahl wird je Browser gemerkt.

## Kategorien und Pakete

- **Kategorien** (Haushalt & Finanzen, Sport & Gesundheit, Kochen & Einkaufen, …) vergibt das System aus Stichwörtern in Name
  und Beschreibung; du legst sie in Verwaltung → Apps von Hand fest oder pflegst Stichwörter unter *Kategorien & Pakete*.
- **Pakete** sind von dir zusammengestellte Gruppen von Apps, die oben auf der Startseite stehen, solange kein Filter aktiv ist.

## Eigene Schubladen und Reihenfolge

Jede Person kann Kacheln in **eigene Schubladen** ordnen und die Reihenfolge von Hand festlegen („Eigene Reihenfolge“), auf der
Startseite und im Gaming Hub (ADR 0015). Das ist rein persönlich und ändert nichts für andere.

## Gaming Hub

Spiele erscheinen nicht zwischen den Apps, sondern im **Gaming Hub** (Knopf und Reiter „Spiele“ auf der Startseite):
Spielername, Bestenlisten, Zeit pro Spiel ([Gaming Hub](wiki:gaming-hub), ADR 0009).

## Hell und dunkel, Handy und PC

Alle Seiten folgen dem Farbschema des Geräts. Bedienelemente sind mindestens 44 px groß, Kontraste erfüllen WCAG AA.
Jede App ist installierbar (PWA) und öffnet auch ohne Netz, sobald sie einmal geladen wurde ([Push und Offline](wiki:push-offline)).
