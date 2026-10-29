-- First-run setup: a fresh installation has no account yet. The setup screen creates the first
-- one (ADR 0027); it becomes the admin without an invite. Once any profile exists, setup is closed.

-- True while nobody has an account. The API checks it before creating the first account.
create function platform.needs_setup() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from platform.profiles);
$$;
revoke execute on function platform.needs_setup() from public, anon, authenticated;
grant execute on function platform.needs_setup() to service_role;

-- Two sign-ups racing on an empty installation must not both become admin: the check and the
-- insert of the first profile run under one lock.
create or replace function platform.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite platform.invites%rowtype;
  v_role platform.user_role := 'user';
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtext('mininode.first_user'));

  select * into v_invite
  from platform.invites i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if not exists (select 1 from platform.profiles) then
    v_role := 'admin';
  elsif v_invite.id is not null then
    v_role := v_invite.role;
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into platform.profiles (user_id, display_name, role)
  values (new.id, left(v_name, 60), v_role);

  insert into platform.app_grants (user_id, app_slug, granted_by)
  select new.id, a.slug, v_invite.created_by
  from platform.apps a
  where (a.is_default or a.slug = any (coalesce(v_invite.app_slugs, '{}')))
    and v_role = any (a.allowed_roles)
  on conflict do nothing;

  if v_invite.id is not null then
    update platform.invites set accepted_at = now(), accepted_by = new.id where id = v_invite.id;
  end if;

  insert into platform.audit_log (actor_id, action, detail)
  values (new.id, 'user.created', jsonb_build_object('role', v_role, 'invite_id', v_invite.id));

  return new;
end;
$$;
