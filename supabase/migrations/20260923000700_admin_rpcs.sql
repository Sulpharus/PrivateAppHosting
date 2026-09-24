-- Admin RPCs used by the Host Manager.

-- Enable/disable an app or make it a default app for new users. Deploy metadata stays CI-owned.
create function platform.admin_set_app_state(
  p_slug text,
  p_disabled boolean default null,
  p_is_default boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) or not (select platform.recent_auth(600)) then
    raise exception 'admin with recent sign-in required' using errcode = '42501';
  end if;
  update platform.apps set
    status = case
      when p_disabled is true then 'disabled'::platform.app_status
      when p_disabled is false and status = 'disabled' then 'online'::platform.app_status
      else status
    end,
    is_default = coalesce(p_is_default, is_default)
  where slug = p_slug;
  if not found then
    raise exception 'unknown app' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.state_changed',
    jsonb_build_object('disabled', p_disabled, 'is_default', p_is_default));
end;
$$;
revoke execute on function platform.admin_set_app_state(text, boolean, boolean) from public, anon;
grant execute on function platform.admin_set_app_state(text, boolean, boolean) to authenticated;

-- AI spend this month, grouped by user and app (micro-euros).
create function platform.admin_ai_usage()
returns table (
  user_id uuid,
  display_name text,
  role platform.user_role,
  app_slug text,
  requests bigint,
  cost_micro bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  return query
    select u.user_id, p.display_name, p.role, u.app_slug, count(*),
      coalesce(sum(case when u.status = 'settled' then u.cost_micro else u.reserved_micro end), 0)::bigint
    from platform.ai_usage u
    join platform.profiles p on p.user_id = u.user_id
    where u.created_at >= date_trunc('month', now()) and u.status in ('settled', 'reserved')
    group by u.user_id, p.display_name, p.role, u.app_slug
    order by 6 desc;
end;
$$;
revoke execute on function platform.admin_ai_usage() from public, anon;
grant execute on function platform.admin_ai_usage() to authenticated;

-- Admins see every remote session (for the Host Manager); users already see their own.
-- Apps: allow admins to read disabled apps too (apps_select already covers is_admin()).
