-- Second factor (authenticator app, TOTP). Once a user has a verified factor, a session that only
-- proved the password (or a Google sign-in) is aal1 and may not use apps or the admin area until
-- it verifies a code (aal2). A passkey sign-in already proves possession and counts as enough.
-- Enforced here rather than in the portal, so the gate, every app's RLS and (through the access
-- token hook) the API follow it too.

-- Whether a token (its `aal` and `amr` claims) satisfies the second-factor rule for this user.
-- Only authenticator apps count as factors: the portal can verify nothing else.
create function platform.mfa_satisfied(p_user_id uuid, p_claims jsonb) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_claims ->> 'aal', '') = 'aal2'
    or exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(p_claims -> 'amr') = 'array' then p_claims -> 'amr' else '[]'::jsonb end
      ) as entry
      where entry ->> 'method' in ('webauthn', 'passkey', 'mfa/webauthn')
    )
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = p_user_id and f.factor_type = 'totp' and f.status = 'verified'
    );
$$;

create function platform.mfa_ok() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select platform.mfa_satisfied((select auth.uid()), coalesce(auth.jwt(), '{}'::jsonb));
$$;

revoke execute on function platform.mfa_satisfied(uuid, jsonb) from public, anon, authenticated;
revoke execute on function platform.mfa_ok() from public, anon;
grant execute on function platform.mfa_ok() to authenticated, service_role;

-- The access token carries `mn_role`, which the API, the NucBox control plane and the SDK trust
-- without asking the database. Until the code is verified, the token says `user` and
-- `mn_mfa: pending` (the gate then sends the browser to the portal's code step).
create or replace function platform.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role platform.user_role;
  v_user_id uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
begin
  select p.role into v_role from platform.profiles p where p.user_id = v_user_id;
  if platform.mfa_satisfied(v_user_id, v_claims) then
    v_claims := jsonb_set(v_claims, '{mn_role}', to_jsonb(coalesce(v_role::text, 'user')));
    v_claims := v_claims - 'mn_mfa';
  else
    v_claims := jsonb_set(v_claims, '{mn_role}', '"user"');
    v_claims := jsonb_set(v_claims, '{mn_mfa}', '"pending"');
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

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
