-- Logos for apps (ADR 0018): a public bucket of small images, one name per app, set by an admin
-- in Verwaltung or picked up by the deploy from an `icon.*` file in the app.

alter table platform.apps
  add column icon_path text
  check (icon_path is null or icon_path ~ '^[a-z0-9][a-z0-9._-]{0,90}\.(png|webp|svg)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-icons', 'app-icons', true, 262144, array['image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- Reading is public through the bucket's URL; only admins write.
create policy app_icons_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'app-icons' and (select platform.is_admin()));
create policy app_icons_update on storage.objects for update to authenticated
  using (bucket_id = 'app-icons' and (select platform.is_admin()))
  with check (bucket_id = 'app-icons' and (select platform.is_admin()));
create policy app_icons_delete on storage.objects for delete to authenticated
  using (bucket_id = 'app-icons' and (select platform.is_admin()));

-- Admin: the logo of an app, or null for the monogram again.
create function platform.admin_set_app_icon(p_slug text, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  update platform.apps set icon_path = p_path where slug = p_slug;
  if not found then
    raise exception 'unknown app' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.icon_set', jsonb_build_object('path', p_path));
end;
$$;
revoke execute on function platform.admin_set_app_icon(text, text) from public, anon;
grant execute on function platform.admin_set_app_icon(text, text) to authenticated;
