-- Zero-migration persistence for simple apps: a key-value store and a file bucket, both
-- isolated per app and per (effective) owner. Apps that outgrow this define their own tables
-- in hosted/<slug>/db with platform.secure_table.

create table platform.app_kv (
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  -- null = shared with every user who has the app (scope 'shared')
  owner_id uuid references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 200),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
-- One row per (app, owner, key); `nulls not distinct` makes shared keys unique as well.
create unique index app_kv_unique_idx on platform.app_kv (app_slug, owner_id, key) nulls not distinct;
create index app_kv_owner_idx on platform.app_kv (owner_id);

alter table platform.app_kv enable row level security;
grant select, insert, update, delete on platform.app_kv to authenticated;
grant all on platform.app_kv to service_role;

create policy app_kv_own on platform.app_kv for all to authenticated
  using ((select platform.has_grant(app_slug)) and owner_id = (select platform.effective_owner(app_slug)))
  with check ((select platform.has_grant(app_slug)) and owner_id = (select platform.effective_owner(app_slug)));

create policy app_kv_shared on platform.app_kv for all to authenticated
  using ((select platform.has_grant(app_slug)) and owner_id is null)
  with check ((select platform.has_grant(app_slug)) and owner_id is null);

create trigger app_kv_touch before update on platform.app_kv
  for each row execute function platform.touch_updated_at();

-- Files: private bucket, object paths are `<app-slug>/<owner-id or "shared">/<file path>`.
insert into storage.buckets (id, name, public, file_size_limit)
values ('app-files', 'app-files', false, 52428800)
on conflict (id) do nothing;

create function platform.may_access_app_file(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select platform.has_grant(split_part(p_name, '/', 1)))
    and (
      split_part(p_name, '/', 2) = 'shared'
      or split_part(p_name, '/', 2) = (select platform.effective_owner(split_part(p_name, '/', 1)))::text
    );
$$;
revoke execute on function platform.may_access_app_file(text) from public, anon;
grant execute on function platform.may_access_app_file(text) to authenticated;

create policy app_files_select on storage.objects for select to authenticated
  using (bucket_id = 'app-files' and (select platform.may_access_app_file(name)));
create policy app_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-files' and (select platform.may_access_app_file(name)));
create policy app_files_update on storage.objects for update to authenticated
  using (bucket_id = 'app-files' and (select platform.may_access_app_file(name)))
  with check (bucket_id = 'app-files' and (select platform.may_access_app_file(name)));
create policy app_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-files' and (select platform.may_access_app_file(name)));
