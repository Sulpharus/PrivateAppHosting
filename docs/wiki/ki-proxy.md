---
title: KI-Proxy und Budgets
category: daten
order: 40
summary: Wie Apps KI nutzen, ohne Schlüssel im Browser, und wie Kosten begrenzt werden
---

Apps rufen KI **nicht** direkt auf. `mn.ai` geht zu `ai.mininode.app` (`apps/ai-proxy`), das über **Cloudflare AI Gateway** zum Anbieter
(Gemini oder Claude) weiterleitet. Die Schlüssel bleiben beim Gateway und im Proxy-Worker.

## Was der Proxy prüft

- **Anmeldung und Freigabe** der aufrufenden App (die Adresse wird auf die App zurückgeführt);
- die **Modell-Liste** aus dem Manifest (`ai.models`: `gemini-flash`, `gemini-pro`, `claude-haiku`, `claude-sonnet`) und eine Obergrenze für `max_tokens`;
- das **Budget**: eine Datenbankfunktion **reserviert** vor dem Aufruf die schlimmstmöglichen Kosten und **verrechnet** danach die echten. Es gibt
  Grenzen global, je App, je Rolle und je Person; der Admin ist vom globalen Stopp ausgenommen.

```ts
const text = await mn.ai.chat('Fasse zusammen: …', { model: 'gemini-flash' });
for await (const chunk of mn.ai.stream(messages, { system: '…' })) render(chunk);
const data = await mn.ai.json<Recipe[]>('Drei Rezepte mit Reis', jsonSchema);
```

Fehler (`AiError`, Code `budget_exceeded`, `model_not_allowed` …) zeigt die App freundlich an.

## Websuche (ADR 0024)

Apps, die aktuelle Fakten brauchen (Wartungsintervalle, Teilenummern), dürfen das Modell im Web suchen lassen: `mn.ai.search(…)` liefert Text **und
Quellen**. Der Manifest-Eintrag `"ai": { …, "search": true }` schaltet das frei, sonst antwortet der Proxy mit „Die Websuche ist für diese App nicht
aktiviert“. Jede Suchanfrage reserviert und verrechnet pauschal 0,05 € zusätzlich zu den Token, damit das Monatsbudget weiter greift. Suche und
JSON-Schema gehen nicht in einem Aufruf: erst suchen, dann das Ergebnis mit `mn.ai.json` ordnen.

## Verwaltung → KI-Proxy

Kosten diesen Monat, Anfragen, Verbrauch je App und die **Budgets** zum Einstellen (in Euro). Ein Manifest kann `monthlyBudgetEur` vorschlagen.

## Einrichten

GitHub-Geheimnisse `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` (Anbieter-Schlüssel) und `AI_GATEWAY_TOKEN` (Gateway-Einstellungen), siehe `first-setup.md`.
Noch nicht möglich: Bilder und Scans durch die KI lesen lassen (der Proxy leitet nur Text weiter).
