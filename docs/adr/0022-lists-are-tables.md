# ADR 0022: Lists are tables, kv is for settings

- Status: accepted
- Date: 2026-10-06

## Context

Apps keep their data in `platform.app_kv`, one JSON row per entry (`tx:2026-10-…`, `item:<id>`,
`act:<id>`). That was the simplest start and it works offline (ADR 0005), but for lists of
entries it has real costs:

- The database knows nothing about the entries: no column types, no `not null`, no checks, no
  foreign keys. A change of the JSON shape is invisible to it.
- Nothing can be asked on the server: no sum per month, no filter by date, no join of a booking
  with its category. Every app loads whole lists into the browser and does the work there.
- Reports across apps (and the Kalender, the map, backups per table) cannot use the data.

Only the Wunschliste and the shares of Medialog had real tables. Offline use was the reason to
stay with kv: `mn.db` talks to PostgREST and needs a connection.

## Decision

1. **A list of entries is a table** in the app's schema `app_<slug>` (`db/NNN_*.sql`, `platform.secure_table`):
   typed columns, `not null` and `check` where a value must exist or be in a range, foreign keys
   between tables (`on delete cascade`), indexes on what is filtered or sorted, `created_at` and
   `updated_at`. Money is an integer (cents), a day is a `date`, a moment a `timestamptz`.
   A `details jsonb` column is for the free-form part only, never for fields the app filters on.
2. **`mn.kv` is for settings**: preferences, small singletons, caches, drafts, a map with a few
   fixed keys.
3. **`mn.table(name)` gives tables the offline behaviour of kv** (`packages/sdk/src/tables.ts`):
   `list`, `get`, `upsert`, `upsertMany`, `remove`, `newId`. Rows share the local copy and the queue of
   changes with kv, so `mn.offline.pending()` and `onSynced` count both. A row needs an `id` (`uuid` made on the
   device by `newId()`, or `text` when the app already has stable ids) that is unique per user, so it can be
   added offline; a table with a composite key says so: `mn.table('t', { conflict: 'owner_id,id' })`.
   The last change that reaches the server wins (whole row: `upsert` sends every column, `null` clears
   one). A row written on the device lacks `owner_id`/`created_at`/`updated_at` until the next `list()`
   online, and `list()` is ordered by id, so the app sorts. For queries, joins and sums on the server use `mn.db` (online only).
4. **`mininode doctor` warns** (rule `entity-collection-in-kv`) when an app writes one kv key per
   entry or lists kv by prefix. A conscious exception is marked with `// kv-collection-ok: <reason>`
   in the file (for example a handful of small entries nobody queries). The check reads the code, not
   the intent: it can warn about a settings key built from a variable (`settings:${userId}`) or any
   `kv.list(`; that is what the exception comment is for. It cannot see keys built in a variable.
5. **Existing apps move one by one**, the way ADR 0002 and the rules for live data say (expand and
   contract): create the tables, copy the entries from kv the first time the app is opened (idempotent
   per `id`, kv is not touched), switch the app to the tables, and drop the kv entries only in a later
   release. Haushalt and Sportplaner go first.

## Consequences

- New apps get tables for their lists from the first version; the spec, the prompts and the
  integration skill say so, and doctor flags the old habit.
- Offline works for rows as before, with the same limits as kv (no merge inside a row; the last
  writer wins). Aggregates and server-side filters need a connection.
- A migrated app keeps its kv entries as a backup until a later release removes them; the data
  exists twice for a while.
- Cross-app use of an app's own tables stays out of scope: other apps read shared records through the
  suite (ADR 0002), not through each other's tables.

## Alternatives considered

- *Keep kv and only document it:* no help for sums, joins or integrity.
- *Online-only tables:* simplest, but the apps would lose the offline use they have today.
- *A generic "records" table for everything:* that is the suite (`platform.records`); it is for data
  that apps share, with a fixed set of types, not for each app's private model.
