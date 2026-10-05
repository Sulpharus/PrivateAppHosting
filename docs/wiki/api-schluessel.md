---
title: API-Schlüssel: für alle oder persönlich
category: daten
order: 50
summary: Wie Apps externe Dienste mit Schlüsseln nutzen, ohne dass sie jemand im Browser sieht
---

Manche Apps brauchen **externe APIs** (Wetter, Karten, Filmdatenbanken). Die Schlüssel dafür landen **nie** in der App oder im Browser (ADR 0006, 0014).

## Wie es funktioniert

1. Die App **deklariert** die API im Manifest (`apis`: `id`, `name`, `baseUrl` (öffentliches https), Platzierung `header`, `bearer` oder `query`, Link zur
   Dokumentation, Begründung; höchstens zehn). Beim Deploy entsteht eine Zeile je API (`platform.api_services`); zwei Apps mit derselben `id` teilen den Schlüssel.
2. Du trägst den Schlüssel einmal unter Verwaltung → **API-Schlüssel** ein (frische Anmeldung nötig). Fehlende Schlüssel stehen zuerst und werden in der
   Navigation gezählt. Sichtbar bleiben nur die letzten vier Zeichen.
3. Die App ruft `mn.api(id).fetch(pfad)` oder `.json(pfad)`. Der Proxy der API (`/proxy/<id>/*`) prüft Anmeldung, App, Freigabe und Deklaration,
   setzt den Schlüssel dorthin, wo die API ihn erwartet, und leitet nur wenige Header weiter. Grenzen: 1 MB Anfrage, 15 s, 60 Aufrufe je Minute und
   Person. Fehlt der Schlüssel, wirft das SDK einen `ExternalApiError` mit `keyMissing`.

Gespeichert wird **verschlüsselt** (AES-GCM mit `VAULT_KEY`; die Adresse und Platzierung der API sind mit verschlüsselt, ein Schlüssel lässt sich also nicht für
eine andere API wiederverwenden). **`VAULT_KEY` aufbewahren**, sonst musst du jeden Schlüssel neu eintragen ([Geheimnisse](wiki:geheimnisse)).

## Für alle oder persönlich

Pro API stellst du den Modus um:

- **Für alle** (Standard): dein Schlüssel bedient jede Person.
- **Persönlich:** jede Person trägt ihren **eigenen** Schlüssel ein (Kosten und Limits je Person). Deiner bleibt gespeichert, wird aber nicht benutzt. Fragt jemand
  die API ohne eigenen Schlüssel auf, zeigt das SDK einmal ein Fenster „Schlüssel einrichten / Später“ und führt zu *Dein Konto → Schlüssel* mit einer Anleitung.
  Du siehst nie die Schlüssel anderer, nur wie viele Personen einen eingetragen haben.

## Ohne Schlüssel

`auth: { "type": "none" }` deklariert eine öffentliche API, die nur über den Proxy läuft, weil Browser sie sonst nicht erreichen.
