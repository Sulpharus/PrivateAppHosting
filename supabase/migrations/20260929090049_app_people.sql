-- The people who may use an app, for sharing inside it (`mn.people()`): display names only, and
-- only asked from the app's own page by someone who may use it (app_access). The caller is left
-- out. Whitelist apps list exactly their whitelist (plus admins).
create function platform.app_people(p_slug text)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name
  from platform.profiles p
  join platform.apps a on a.slug = p_slug
  where (select platform.app_access(p_slug))
    and p.user_id <> (select auth.uid())
    and a.status <> 'disabled'
    and p.role = any (a.allowed_roles)
    and (
      p.role = 'admin'
      or exists (
        select 1 from platform.app_grants g where g.app_slug = p_slug and g.user_id = p.user_id
      )
    )
  order by p.display_name;
$$;
revoke execute on function platform.app_people(text) from public, anon;
grant execute on function platform.app_people(text) to authenticated;
