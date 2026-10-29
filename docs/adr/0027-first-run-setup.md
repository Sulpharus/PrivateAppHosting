# ADR 0027: First-run setup creates the admin account

- Status: accepted
- Date: 2026-10-29

## Context

A new installation had no way to get its first account except a Supabase dashboard step (cloud) or
a terminal prompt in the installer (desktop). Both are easy to get wrong, and the cloud one asks a
beginner to use a tool they have not seen. Sign-ups stay off, so the first account cannot come
from the login page either.

## Decision

While nobody has an account, the portal sends every visit to `/setup`: email, password and the
password again. The API (`POST /setup`, public) creates a confirmed account through the Auth admin
API. The database trigger `platform.handle_new_user` already gives the first profile the admin role
without an invite; it now takes an advisory lock so two simultaneous claims cannot both become
admin. The API checks the role afterwards and deletes an account that lost the race.

Setup is closed by the database, not by a flag: `platform.needs_setup()` is true only while
`platform.profiles` is empty, so there is nothing to reset and nothing to forget. `GET /setup`
reports it without a session; `POST /setup` answers 409 once an account exists. Passwords need 12
characters, like everywhere else. The installer no longer asks for an email; `--admin-email`
still creates the account in the terminal.

## Consequences

On the internet the first visitor wins. A cloud installation therefore asks the owner to open the
portal right after the deploy and before sharing the address; the desktop edition listens on this
computer only unless `--lan` is used. A setup token would close that window; it was left out to keep
the first start free of extra secrets. [?] Add one if installations are often exposed before the
owner arrives.
