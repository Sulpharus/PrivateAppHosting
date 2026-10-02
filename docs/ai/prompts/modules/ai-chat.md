---
id: ai-chat
title: KI-Assistent im Chat
summary: Chatverlauf, Streaming, Systemanweisung, Budget und Abbruch
group: anbindungen
order: 24
---

## Feature: AI chat assistant

- Use `mn.ai.stream(messages, { system })` and render chunks as they arrive into the last
  assistant bubble. Keep `messages` as `{ role: 'user' | 'assistant', content }` and send only
  the last ~20 turns, to stay inside the token and money budget.
- Write the system prompt in the app, in the user's language, with the app's task and its limits
  ("Du hilfst bei Rezepten. Antworte kurz auf Deutsch."). Give it the data it needs as text; the
  model cannot see the screen.
- Show a "Stopp" button while streaming and keep what has arrived. A second send while one is
  running is disabled.
- Handle `AiError`: `budget_exceeded` ("Dein KI-Budget für diesen Monat ist aufgebraucht"),
  `model_not_allowed`, network errors with "Erneut versuchen". Declare the models and a small
  `monthlyBudgetEur` in `mininode.json`.
- Save the conversation in `mn.kv` (`chat:<id>`) with a title taken from the first question, and
  offer "Neuer Chat" and deleting one. Chats are private to the user.
- Say that answers can be wrong when the topic matters (health, money, law). Never send other
  people's data to the model unless the user chose it for this request.
- Ask for structured answers with `mn.ai.json(prompt, schema)` when the app must act on them,
  and validate the result before using it.
