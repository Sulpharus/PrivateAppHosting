-- Language preference (ADR 0017): one setting per person for the whole platform. The portal
-- reads it after sign-in and mirrors it into the `mn-lang` cookie, which apps with a language
-- package read to pick their language. Safe on live data: a new column with a default, so every
-- existing profile keeps German.

alter table platform.profiles
  add column language text not null default 'de' check (language in ('de', 'en'));

-- Like the display name, a person changes their own language (the existing update policy
-- already limits the rows to their own).
grant update (language) on platform.profiles to authenticated;
