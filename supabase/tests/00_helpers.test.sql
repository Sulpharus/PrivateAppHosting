-- Test helpers shared by all pgTAP files. Created in the `tests` schema, which only exists in
-- local/CI databases (this file runs first; the helpers survive because it commits).
begin;
create extension if not exists pgtap with schema extensions;

create schema if not exists tests;
grant usage on schema tests to authenticated, service_role;

-- Creates an auth user (the platform trigger creates the profile) and returns its id.
create or replace function tests.create_user(p_email text, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', p_email,
    jsonb_build_object('display_name', coalesce(p_name, split_part(p_email, '@', 1))), now(), now()
  );
  return v_id;
end;
$$;

-- Switches the session to an authenticated user. `p_auth_age` is seconds since sign-in (step-up).
create or replace function tests.login(p_user_id uuid, p_auth_age integer default 0)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user_id,
    'role', 'authenticated',
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'passkey',
      'timestamp', extract(epoch from now())::bigint - p_auth_age))
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.logout()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Gives a test file an empty platform (inside its own transaction, so nothing is lost):
-- local databases also hold data from e2e runs and `mininode dev`.
create or replace function tests.reset()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from platform.apps;
  delete from auth.users;
end;
$$;

grant execute on all functions in schema tests to authenticated, service_role;

select plan(1);
select has_function('tests', 'login', array['uuid', 'integer'], 'test helpers are installed');
select * from finish();
commit;
