-- Settings for the whole installation, switched in Verwaltung → Einstellungen. One row (id 1).
-- Everyone signed in reads it (the portal decides how links open); only an admin with a recent
-- sign-in changes it.

create table platform.instance_settings (
  id smallint primary key default 1 check (id = 1),
  -- Outside websites open in the portal's own viewer (installed app only); off: in the browser.
  external_viewer boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

insert into platform.instance_settings (id) values (1);

create function platform.instance_settings_stamp() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;
revoke execute on function platform.instance_settings_stamp() from public, anon, authenticated;

create trigger instance_settings_stamp before update on platform.instance_settings
  for each row execute function platform.instance_settings_stamp();

alter table platform.instance_settings enable row level security;
revoke all on platform.instance_settings from public, anon, authenticated;
grant select, update (external_viewer) on platform.instance_settings to authenticated;
grant all on platform.instance_settings to service_role;

create policy instance_settings_read on platform.instance_settings for select to authenticated
  using (true);
create policy instance_settings_admin_update on platform.instance_settings for update to authenticated
  using ((select platform.is_admin()))
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));
