-- Which model each AI alias calls, and what it costs, editable in Verwaltung → KI-Proxy.
-- The aliases are fixed (apps declare them in mininode.json); the admin keeps the model ids and
-- prices current. The proxy reads the rows (cached for a minute) and falls back to the ids in
-- apps/ai-proxy/src/models.ts when a row is missing or the table cannot be read.

create table platform.ai_models (
  alias text primary key
    check (alias in ('gemini-flash', 'gemini-pro', 'claude-haiku', 'claude-sonnet')),
  model_id text not null check (model_id ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  -- € per million tokens; provider list prices in USD are used as € (slightly high on purpose).
  input_eur_per_mtok numeric(10, 4) not null check (input_eur_per_mtok between 0 and 1000),
  output_eur_per_mtok numeric(10, 4) not null check (output_eur_per_mtok between 0 and 1000),
  -- Claude only: the effort sent with every request; null sends none.
  effort text check (effort in ('low', 'medium', 'high')),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint ai_models_effort_claude_only check (effort is null or alias like 'claude-%')
);

insert into platform.ai_models (alias, model_id, input_eur_per_mtok, output_eur_per_mtok, effort)
values
  ('gemini-flash', 'gemini-3.7-flash', 0.75, 3.75, null),
  ('gemini-pro', 'gemini-3.1-pro', 2, 12, null),
  ('claude-haiku', 'claude-haiku-5-5', 0.5, 2.5, 'low'),
  ('claude-sonnet', 'claude-sonnet-5-5', 2, 10, 'low');

create function platform.ai_models_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke execute on function platform.ai_models_stamp() from public, anon, authenticated;

create trigger ai_models_stamp before update on platform.ai_models
  for each row execute function platform.ai_models_stamp();

alter table platform.ai_models enable row level security;
revoke all on platform.ai_models from public, anon, authenticated;
grant select, update (model_id, input_eur_per_mtok, output_eur_per_mtok, effort)
  on platform.ai_models to authenticated;
grant all on platform.ai_models to service_role;

create policy ai_models_admin_read on platform.ai_models for select to authenticated
  using ((select platform.is_admin()));
-- Changing what every app's AI calls cost needs a recent sign-in, like the budgets.
create policy ai_models_admin_update on platform.ai_models for update to authenticated
  using ((select platform.is_admin()))
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));
