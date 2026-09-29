# ADR 0008: People directory for sharing inside an app

- Status: accepted
- Date: 2026-09-29

## Context

Apps with `data.mode: private` keep each user's data apart. Some of them still want to hand
single items to someone else, e.g. Medialog shares a reading list with one friend. For that
the app needs to know who else may use it, and it needs a place where only the chosen people
can read the shared copy. Shared kv (`mn.kv` scope `shared`) is readable and writable by every
user of the app, so it cannot hold per-person shares.

## Decision

- `platform.app_people(slug)` (security definer, `search_path = ''`, not for `anon`) returns
  `user_id` and `display_name` of the people who may open the app:
  - role in `allowed_roles`, and a grant or the admin role (as `has_grant`);
  - only while the app is not disabled; a whitelist app lists exactly its whitelist and admins;
  - only when called from the app's own page by someone with access (`app_access`);
  - without the caller.
- The SDK exposes it as `mn.people(): Promise<{ id, name }[]>`.
- It returns display names only, never e-mail addresses or roles. Every user of the app
  could see these names anyway when the app shows who changed or shared something.
- The shared copies live in an app table, not in kv. Medialog's `app_medialog.shares` is the
  pattern:
  - the owner writes it (`secure_table ... 'private'`);
  - recipients read it through `app_medialog.shared_with_me()` (security definer,
    `search_path = ''`), which checks `app_access` and `auth.uid() = any (recipients)`;
    `mininode doctor` refuses hand-written policies, so this follows the Wunschliste pattern;
  - the sender is the row's `owner_id` with the name from `platform.profiles`, never a name
    inside the payload.
- Shared copies leave out private parts (notes, history, photos) unless the app says clearly
  that they are shared.

## Consequences

- Any page of an app with access can list the names of the app's users. We accept this: users
  are invited people who know each other. Apps that do not share never need to call it.
- The prompt module "Teilen und Echtzeit" describes `mn.people()` and the share table, so
  generated apps use them instead of shared kv.
