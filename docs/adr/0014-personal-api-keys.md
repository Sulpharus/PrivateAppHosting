# ADR 0014: API keys: site-wide or personal

- Status: accepted
- Date: 2026-10-01

## Context

ADR 0006 gives each external API one key, entered by the admin, that serves everyone. For paid or
rate-limited APIs the admin may rather want everyone to use their own key and quota.

## Decision

Each API entry has a mode (`platform.api_services.key_mode`), switched by the admin in Verwaltung →
API-Schlüssel (`PUT /admin/api-services/:id/mode`, sign-in within ten minutes, audited):

- **sitewide** (default): the admin's key serves every user, as in ADR 0006.
- **personal**: every user enters their own key. The admin's key stays stored but is unused;
  switching back makes it count again. The admin page shows how many people entered one, and the
  navigation counter only counts missing site-wide keys.

**Storage.** `platform.user_api_keys` holds the key per user, AES-GCM encrypted with `VAULT_KEY`;
the additional data is the API's id, `baseUrl` and `auth` plus the user id, so a stored key
cannot be used for another API or moved to another account. The table has no grants for clients;
the API Worker writes it. A change of an API's target drops personal keys too (the migration's
`register_app_apis`). `platform.my_api_keys()` shows a user the personal APIs of apps they may
open, with the last four characters of their own key; `admin_personal_key_counts()` gives the admin
numbers only.

**Entering a key.** `PUT /me/api-keys/:service` and `DELETE` work only for APIs that appear in
`my_api_keys()` for that user (personal mode, an app they may open requests it).

**The proxy** uses the caller's own key in personal mode. Without one it answers 503
`api_key_missing` with `personal: true`, the API's id and name. The SDK reacts for every app:
`ExternalApiError.needsPersonalKey` is true and a popup (a modal `<dialog>`, focus on its button,
Escape closes it) offers "Schlüssel einrichten" or "Später". It appears once per API and page, and
stays away for ten minutes after "Später". The button leads to `mininode.app/account/keys?service=…
&next=<app>`: an instruction page (where to get the key, with the provider's link from the
manifest's `docs` when there is one), the field, and "Zurück zur App" after saving. An unreadable
stored key asks again with different wording.

## Consequences

- Apps need no change: the SDK and the proxy do it. An app that wants its own wording can read
  `needsPersonalKey`.
- AI keys of the AI proxy (Gemini, Claude) are not part of this; they stay platform-wide.
- A user's key can be used for any request below the API's `baseUrl` from an app they may open,
  like the site-wide key (ADR 0006); the admin cannot read it through the portal but could with
  access to the Worker's secrets and database.
