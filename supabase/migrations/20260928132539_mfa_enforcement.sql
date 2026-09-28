-- Second factor (authenticator app, TOTP). Once a user has a verified factor, a session that only
-- proved the password (or a Google sign-in) is aal1 and may not use apps or the admin area until
-- it verifies a code (aal2). A passkey sign-in already proves possession and counts as enough.
-- Enforced here rather than in the portal, so the gate and every app's RLS follow it too.

create function platform.mfa_ok() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
      where entry ->> 'method' in ('webauthn', 'passkey', 'mfa/webauthn')
    )
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    );
$$;

revoke execute on function platform.mfa_ok() from public, anon;
grant execute on function platform.mfa_ok() to authenticated, service_role;

create or replace function platform.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select platform.current_user_role()) = 'admin', false)
    and (select platform.mfa_ok());
$$;

create or replace function platform.has_grant(p_slug text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select platform.mfa_ok()) and exists (
    select 1
    from platform.apps a
    join platform.profiles p on p.user_id = (select auth.uid())
    where a.slug = p_slug
      and a.status <> 'disabled'
      and p.role = any (a.allowed_roles)
      and (
        p.role = 'admin'
        or exists (
          select 1 from platform.app_grants g
          where g.app_slug = a.slug and g.user_id = p.user_id
        )
      )
  );
$$;
