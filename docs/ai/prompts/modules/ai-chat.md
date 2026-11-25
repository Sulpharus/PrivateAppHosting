---
id: ai-chat
title: KI-Assistent im Chat
summary: Chatverlauf, Streaming, Systemanweisung, Budget und Abbruch
when: Nimm das, wenn die App einen Chat mit einer KI haben soll, der Fragen zum Thema der App beantwortet.
group: anbindungen
order: 24
---

## Feature: AI chat assistant

- Use `mn.ai.stream(messages, { system })` and render chunks as they arrive into the last
  assistant bubble. Keep `messages` as `{ role: 'user' | 'assistant', content }` (text only) and
  send only the last ~20 turns, to stay inside the token and money budget.
- Write the system prompt in the app, in the person's language, with the app's task and its
  limits ("Du hilfst bei Rezepten. Antworte kurz auf Deutsch." / "Answer briefly in English.").
  Give it the data it needs as text; the model cannot see the screen.
- Show a "Stopp" button while streaming (pass an `AbortSignal` as `signal`) and keep what has
  arrived. A second send while one is running is disabled.
- Handle `AiError`: `budget_exceeded` ("Dein KI-Budget für diesen Monat ist aufgebraucht"),
  `model_not_allowed`, network errors with "Erneut versuchen". Declare the models and a small
  `monthlyBudgetEur` in `mininode.json`.
- Save conversations in a table `chats` (`id`, `title text not null` taken from the first
  question, `messages jsonb not null default '[]'`, timestamps), one row per chat; offer "Neuer
  Chat" and deleting one. Chats are private to the person (`private` table).
- Say that answers can be wrong when the topic matters (health, money, law). Never send other
  people's data to the model unless the person chose it for this request.
- Ask for structured answers with `mn.ai.json(prompt, schema)` when the app must act on them,
  and validate the result before using it.
