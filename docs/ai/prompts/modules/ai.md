---
id: ai
title: KI-Funktionen
summary: Zusammenfassen, Vorschläge, Extraktion über mn.ai
order: 20
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
- Never send personal data (contacts, health, finance) without the user pressing the button
  for exactly that item.
