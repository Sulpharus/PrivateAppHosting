---
id: ai
title: KI-Funktionen
summary: Zusammenfassen, Vorschläge, Extraktion über mn.ai
order: 20
group: anbindungen
---

## Feature: AI

- Every AI call goes through `mn.ai`: `chat(prompt, { model, system })`, `stream(messages)`,
  `json(prompt, jsonSchema)`. Declare the models in `mininode.json` under `ai.models` with a
  small `monthlyBudgetEur` (1 to 5) and `maxOutputTokens`.
- Default model `gemini-flash`; use `claude-sonnet` only where quality matters and say so in
  the README.
- AI runs only when the user presses a button with a clear label ("Mit KI zusammenfassen",
  "Vorschläge holen"), never automatically on load or while typing.
- Show a skeleton or streamed text while it runs, and allow cancelling.
- Structured results use `mn.ai.json` with a JSON schema; validate the result before saving.
- Errors: `AiError.code` `budget_exceeded` → "Dein KI-Budget für diesen Monat ist aufgebraucht."
  `model_not_allowed`, `rate_limited`, network → a short message and a retry button.
- Mark AI output as such (a `mn-chip--plain` "KI-Vorschlag") until the user accepts it.
- Facts that must be exact and current (service intervals, part numbers, opening hours) use
  `mn.ai.search(messages)`: it returns `{ text, sources }`. Add `"search": true` to the `ai` block
  of `mininode.json`, show the sources as links next to every number, mark the result
  "KI-Vorschlag mit Quellen" until the person confirms it, and cache it in your own table. To get
  structured data out of the found text, call `mn.ai.json` afterwards (search and a JSON schema
  do not work in one call).
- Never send personal data (contacts, health, finance) without the user pressing the button
  for exactly that item.
