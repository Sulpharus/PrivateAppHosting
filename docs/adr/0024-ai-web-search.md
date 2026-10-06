# ADR 0024: AI web search for apps that need current facts

- Status: accepted
- Date: 2026-10-06

## Context

`mn.ai` answers from what the model knows. Some apps need facts that are specific and current: the
service intervals and parts of a car model, opening hours, prices. A model that guesses them is
worse than none, and an app cannot call a search engine itself (keys stay on the host, ADR 0006).

## Decision

1. **The proxy can let the model search the web.** `mn.ai.search(messages, options)` sends the
   request with `search: true`; the proxy turns it into the provider's own tool (Claude
   `web_search`, Gemini `google_search` grounding) and returns `{ text, sources: [{ title, url }] }`.
   The app shows the sources next to the answer.
2. **Opt-in per app:** `"ai": { …, "search": true }` in `mininode.json`. Without it the proxy
   answers 403 `search_not_allowed`. The admin sees it in the manifest like the models.
3. **Chat only.** Search combined with a JSON schema is not supported; an app searches first and
   then calls `mn.ai.json` with the found text to get structured data.
4. **Budget:** every search request reserves and settles a flat extra amount on top of the tokens
   (`SEARCH_SURCHARGE_MICRO`, € 0.05), because providers bill searches per query and one request may
   search several times. The monthly budgets of ADR 0003 apply unchanged.
5. **Honesty in the apps:** results from a search are shown as "KI-Vorschlag mit Quellen" until the
   person confirms them, and numbers that matter (torque, intervals, part numbers) are always shown
   together with their source link.

## Consequences

- One platform feature serves every app that needs lookups (vehicle log, travel, recipes).
- Costs rise with use; the budget stops it. Search-heavy apps should cache results in their own
  tables so the same question is not asked twice.
- Gemini grounding and Claude's search tool differ in detail; the proxy hides it, and
  `MODEL_CATALOG` still selects the model.
