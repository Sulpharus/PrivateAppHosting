---
id: api-keys
title: Externe APIs mit Schlüssel
summary: Wetter, Karten & Co. über Host-Schlüssel, die der Admin einmal einträgt
order: 36
---

## Feature: External APIs with host-level keys

MiniNode keeps API keys on the server. The app declares the API, the admin enters the key once
under Verwaltung → API-Schlüssel, and every call goes through the MiniNode API, which adds the key.
Apps that declare the same API `id` share one key.

- **Never put an API key in the app**: not in code, `.env`, `mininode.json`, `localStorage`,
  or a settings field where the user types one in. Never call a keyed API directly from the browser.
- Declare every external API in `mininode.json` (at most 10):

  ```json
  "apis": [
    {
      "id": "openweathermap",
      "name": "OpenWeatherMap",
      "baseUrl": "https://api.openweathermap.org/data/2.5",
      "auth": { "type": "query", "param": "appid" },
      "docs": "https://home.openweathermap.org/api_keys",
      "reason": "Aktuelles Wetter und 5-Tage-Vorhersage für den Wohnort"
    }
  ]
  ```

  - `id`: lowercase, the name of the key, not of the app (`openweathermap`, `google-maps`,
    `deepl`, `tmdb`). Reuse the id an existing MiniNode app already uses for the same API, with
    the **same** `baseUrl` and `auth`. Otherwise the deploy stops. Changing `baseUrl` or `auth`
    later discards the stored key, so the admin has to enter it again.
  - `baseUrl`: public `https` URL without query or credentials. Every call goes below it.
  - `auth`: where the key goes:
    - `{ "type": "query", "param": "appid" }` for `?appid=KEY`;
    - `{ "type": "bearer" }` for `Authorization: Bearer KEY`;
    - `{ "type": "header", "name": "X-Api-Key" }` for a custom header, with an optional
      `"prefix": "DeepL-Auth-Key "`. `Authorization` is fine; `Cookie`, `Host`, `Content-Type`
      and `Accept*` are not allowed.
  - `docs`: where the admin gets a key. `reason`: one German sentence the admin sees.
- Call it with `mn.api(id)`:
  - `const data = await mn.api('openweathermap').json('/weather?q=München&units=metric&lang=de')`;
  - or `mn.api(id).fetch(path, { method, headers, body })` for the raw `Response`.
  - The path is relative to `baseUrl`; encode query values with `URLSearchParams`.
  - Only `Accept`, `Accept-Language` and `Content-Type` are forwarded. Never send your own
    `Authorization` or key parameter, because the server overrides it.
- **Errors:** `ExternalApiError` (`import { ExternalApiError } from '@mininode/sdk'`, or
  `window.mininode.ExternalApiError` for plain HTML apps):
  - `err.keyMissing` (codes `api_key_missing`, `api_key_unreadable`): the admin has not
    entered the key yet. Show a friendly empty state, not an error: "Diese Funktion wird gerade
    eingerichtet. Sobald der Schlüssel hinterlegt ist, erscheinen hier die Daten." The rest of
    the app keeps working.
  - `rate_limited` (60 calls per minute and user): back off and show the last data.
  - `api_unavailable` / 5xx / `upstream_error`: "Der Dienst ist gerade nicht erreichbar" with a
    retry button, and keep what is shown.
  - `api_not_declared`: the `apis` block is missing or not deployed yet. This is a developer
    error, so log it.
- **Be economical:**
  - cache answers in `mn.kv` with a timestamp and reuse them while fresh (e.g. weather 30 min,
    geocoding forever);
  - debounce search-as-you-type (≥ 300 ms, ≥ 3 characters);
  - never poll in a loop;
  - keep bodies under 1 MB.
- Show the source ("Daten: OpenWeatherMap") where the API's terms require attribution.

### Converting an existing app

1. Find every place that calls the external API directly and every key the app has (constants,
   `.env`, `import.meta.env`, settings fields, `localStorage`). Delete the keys and any "API-Key
   eingeben" UI.
2. Add the `apis` entry to `mininode.json` as above: base URL = the common prefix of the calls,
   `auth` = where the key used to go.
3. Replace `fetch('https://api.example.com/v1/x?key=…&q=…')` with
   `mn.api('example').fetch('/x?q=…')`, dropping the key parameter or header.
4. Add the `keyMissing` empty state and the error handling above.
5. Tell the admin in the summary: "Nach dem Deploy unter Verwaltung → API-Schlüssel den
   Schlüssel für <Name> eintragen (Link: <docs>)."
