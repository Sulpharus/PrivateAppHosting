-- Tracks which hosted-app migrations (hosted/<slug>/db/*.sql) have been applied, so deploys are
-- idempotent and a changed, already-applied file is detected instead of silently skipped.

create table platform.app_migrations (
  app_slug text not null,
  filename text not null,
  checksum text not null,
  applied_at timestamptz not null default now(),
  primary key (app_slug, filename)
);

alter table platform.app_migrations enable row level security;
grant all on platform.app_migrations to service_role;
-- No policies: only the deploy pipeline (service role / postgres) touches this table.
