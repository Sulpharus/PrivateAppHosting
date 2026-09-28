# ADR 0002: Suite data, shared collections and app permissions

- Status: accepted (phase 1 implemented)
- Date: 2026-09-28

## Context

Apps should work together as a suite. For example, a task written in *Notizen* should show up
in a calendar, holiday photos should appear on the calendar day and on a map, and *Sportplaner*
tariffs should become bookings in *Haushalt*. Today every app keeps its data to itself
(`mn.kv`, `app_<slug>` tables). Some data also has to be shared between people, such as a
family calendar or household tasks.

We found one gap while planning this. The database only knows **which user** is asking, not
**which app** is asking. Every app runs in the browser with the same session, and `app_kv` takes
`app_slug` from the client. So app A can read app B's data whenever the user has both apps.
Per-app permissions therefore first need a trustworthy app identity.

## Decision

### 1. App identity from the browser origin

- Every app runs on its own origin (`https://<slug>.mininode.app`). Browsers set the `Origin`
  header themselves, and page scripts cannot forge it.
- A database function `platform.calling_app()` reads the origin from the request headers that
  PostgREST and Storage pass on, and looks it up in `platform.app_origins`. Deploys register
  `https://<slug>.<domain>`; `mininode dev` registers `http://localhost:<port>`. Unknown or
  missing origins give `null`, which means no app rights. The portal has no app identity.
- Every policy on app or shared data checks the user **and** `calling_app()` through
  `platform.app_access(slug)`. It covers `app_kv`, app files, app tables (`secure_table`) and
  `notify_self`, and closes the gap above (migration `20260928100740_app_identity`).
- Server-side apps (NucBox containers) identify themselves with a per-app service token
  through the API Worker, never with the user's JWT alone.
- Deploys only add origins; old ones (a renamed domain, earlier dev ports) stay until the app
  row is deleted. That is harmless, because they still point at the same app.

**Limits.** Origin isolation protects against buggy apps, not hostile ones.
- A user who scripts requests with their own session can set any `Origin`. That only exposes
  data the user may already see.
- The session cookie `mn-auth` lives on `.mininode.app` and is readable by JavaScript, and the
  gate CSP allows `img-src https:`. A malicious app can therefore read the user's tokens,
  send them to its own server and replay them with a forged `Origin`. Only apps the admin
  integrated run on the platform, so we accept this for now. Hardening later means an
  HttpOnly session cookie per app host and a narrower `img-src`.
- Realtime does not pass request headers to the database. `postgres_changes` on app data
  therefore delivers nothing. `mn.realtime` broadcast channels (`<slug>:<channel>`) are not
  authorised, so another app could join them. Suite realtime (phase 4) uses private
  channels with an authorisation policy on `realtime.messages`.

### 2. One generic record store with a type registry

- `platform.records` is one table for all shared data:
  - Common, indexed columns: `id`, `type`, `collection_id`, `title`, `starts_at`, `ends_at`,
    `due_at`, `status`, `amount_cents` + `currency`, `geo` (PostGIS point) + `place_name`,
    `created_by`, `created_by_app`, `updated_by_app`, `version`, `deleted_at`.
  - A typed `data jsonb` column holds the rest.
  - `source_app` + `source_key` form the idempotency key, e.g. `notizen` + `note-17#line-3`.
  - `field_sources jsonb` records which app last wrote which field.
- `platform.record_types` is the registry. Per type it holds:
  - the JSON Schema for `data`, validated in the database (`pg_jsonschema`) and in the SDK;
  - which common columns the type uses;
  - its **identity keys** for de-duplication;
  - its calendar and map projection.
- `platform.record_links` stores typed links between records: `from`, `to`, `kind`, e.g.
  `derived_from`, `attachment_of`, `part_of`, `about`.
- Attachments and media live in the bucket `suite-files/<collection>/<record>/…`. A file is
  itself a `file` or `media` record, so images inside any type are just linked records.
- A universal calendar shows every record that has `starts_at`/`due_at`. A universal map
  shows every record that has `geo`. Neither needs to know the individual types.
- We chose one table over one table per type. RLS, the SDK and the admin UI are written
  once, and new types need a registry entry instead of a migration. Type safety comes from
  the schema registry, and hot types get partial indexes.

### 3. Collections (Sammlungen)

- Every record belongs to exactly one collection. Every user automatically gets a
  **personal collection** per type family, e.g. "Meine Aufgaben".
- **Shared collections** have members with roles *owner*, *editor* and *viewer*, e.g.
  "Familienkalender" or "Haushalt Müller". The collection owner manages members; the admin
  sees and can manage every collection.
- A user can read a record if they are a member of its collection (viewer or higher) **and**
  the calling app has the right for that type (section 4). Both conditions are enforced in RLS.
- `shared-account` apps map naturally to one shared collection per app owner.

### 4. App permissions: request → approval → priority

Only the admin decides app permissions. Users cannot change them.

1. **Request.** The manifest declares what the app wants, with a reason:

   ```json
   "suite": {
     "uses": [
       { "type": "task", "access": "write", "why": "Aufgaben aus Notizen erzeugen" },
       { "type": "event", "access": "read", "why": "Termine neben Notizen anzeigen" }
     ]
   }
   ```

   The access levels are `read` < `create` < `write` (edit own and foreign records) <
   `delete`. Deploying registers the request as **pending**. The app gets nothing until
   the admin approves it.
2. **Approval.** The admin approves in *Verwaltung → Gemeinsame Daten*, using a matrix of
   app × type. The admin can grant less than requested, e.g. `read` instead of `write`.
3. **Write permission and priority are separate.**
   - Whether an app may write a type at all is set by its approved access level.
   - When several apps write the **same slot**, **priority** decides which one counts. The
     admin sets an ordered priority list per type. A slot is the same record, found via
     identity keys, and the same field.
4. **Conflict rules.**
   - When a lower-priority app writes a field that `field_sources` says a higher-priority app
     wrote last, the write is rejected for that field. The SDK tells the app, and the rest
     of the write goes through.
   - **De-duplication:** a create whose identity keys match an existing record becomes a
     merge. For example, contacts match on email/phone, events on title + start in the same
     collection, bank transactions on date + amount + counterparty, and photos on content
     hash. The merge respects priority, so a lower-priority app never duplicates a record
     and never overwrites a stronger one.
   - Deleting a record another app created needs `delete` **and** higher priority than the
     creator. Deleted records go to a 30-day bin.
5. **Warnings.**
   - `mininode doctor` and the deploy log warn when a new app requests `create` or higher on
     a type another approved app already writes.
   - The admin matrix marks overlaps and shows the rejected and merged writes of the last
     30 days per app pair.

### 5. SDK surface

```ts
const tasks = mn.suite.type('task');
await tasks.list({ collection: 'mine', due: { before: '2026-10-01' } });
await tasks.upsert({ sourceKey: 'note-17#line-3', title: 'Steuer abgeben', due_at: '2026-07-31' });
await mn.suite.link(taskId, noteRecordId, 'derived_from');
mn.suite.collections();                  // mine + shared ones the user belongs to
mn.suite.subscribe('event', onChange);   // realtime for collaborative apps
```

Every write returns `{ record, merged, rejectedFields }`, so apps can show conflicts.

## Consequences

- Closing the origin gap changes existing policies. Test the platform e2e suite and the
  pgTAP meta-test before rollout. The meta-test will also require `calling_app()` on every
  suite policy.
- A generic table relies on the registry for type safety. A bad schema is a platform bug,
  not an app bug. Schema changes are versioned: `type@version`, and data is migrated forward.
- PostGIS and pg_jsonschema must be enabled on both Supabase projects. Both are available
  on the free plan [?] verify before phase 2.
- The type catalog is in `docs/suite/data-types.md`. The build order is in ADR 0003.
