# ADR 0031: Admins write readonly apps, and the AI models are set in Verwaltung

- Status: accepted
- Date: 2026-11-25

## Context

Data mode `readonly` granted only `select`: content could come only from an app's SQL files, so an
app like "Vereinstermine" could not be maintained in the app, although the prompt library and the
spec had promised "only the admin writes" (found in the review of ADR 0030).

The AI proxy maps the aliases apps declare (`gemini-flash`, `gemini-pro`, `claude-haiku`,
`claude-sonnet`) to provider model ids and prices in code (`apps/ai-proxy/src/models.ts`), with the
`MODEL_CATALOG` var as an override. Providers release new models every few months; the owner wants to
keep the mapping current without a code change or a deploy.

## Decision

**Readonly: everyone reads, admins write.** `platform.secure_table(…, 'readonly')` grants
`select, insert, update, delete` and adds, next to the read policy, three admin policies
(`<table>_admin_insert|update|delete`) that require `platform.app_access(<slug>)` and
`platform.is_admin()`. So an admin writes only from the app's own page, like every other write. The
migration adds the same policies to every readonly table that already exists. Apps show edit controls
to admins (`mn.auth.role()`); the database is the protection.

**AI models in the database.** `platform.ai_models` has one row per alias: provider model id, € per
million input and output tokens, and (Claude only) the effort sent with each request. Admins read and
update it (an update needs a recent sign-in, like the budgets; `updated_by` and `updated_at` are set
by a trigger); nobody inserts or deletes, the four aliases are fixed. The proxy reads the rows with
the service role, caches them for a minute, and builds the catalog as code defaults ← database rows ←
`MODEL_CATALOG` (kept as an emergency override). If the table cannot be read, the defaults apply.
Verwaltung → KI-Proxy → *Modelle* edits the rows.

## Consequences

- A model id typed wrong fails the next request with a provider error for apps using that alias; the
  page links the providers' model lists. The id is checked for shape only (`^[a-z0-9][a-z0-9._-]+$`).
- Prices drive the budget reservation; entering them too low lets real spend exceed a budget.
  The page says to enter the providers' USD list prices as €.
- New aliases still need code (manifest schema, SDK type, proxy) and a migration row.
