begin;
select plan(10);
select tests.reset();

select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, is_default, status)
values ('notizen', 'Notizen', 'Notes', 'spa', 'cloudflare', '{}', false, 'online');
insert into platform.app_grants (user_id, app_slug) values (:'user_id', 'notizen');

-- Signs in with the given method and assurance level (what a password or Google session carries).
create function pg_temp.login_as(p_user uuid, p_method text, p_aal text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', p_method, 'timestamp', extract(epoch from now())::bigint)))::text, true),
    set_config('role', 'authenticated', true);
$$;

-- Without a factor, a password session is enough.
select pg_temp.login_as(:'user_id', 'password', 'aal1');
select ok(platform.has_grant('notizen'), 'password session without a factor may use apps');
select pg_temp.login_as(:'owner_id', 'oauth', 'aal1');
select ok(platform.is_admin(), 'Google session without a factor is admin');
select tests.logout();

-- A verified authenticator app raises the bar to aal2.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values
  (gen_random_uuid(), :'user_id', 'Handy', 'totp', 'verified', now(), now()),
  (gen_random_uuid(), :'owner_id', 'Handy', 'totp', 'verified', now(), now());

select pg_temp.login_as(:'user_id', 'password', 'aal1');
select ok(not platform.has_grant('notizen'), 'aal1 session with a factor may not use apps');
select is((select count(*)::int from platform.apps), 0, 'aal1 session with a factor sees no apps');
select pg_temp.login_as(:'owner_id', 'oauth', 'aal1');
select ok(not platform.is_admin(), 'aal1 session with a factor is not admin');

select pg_temp.login_as(:'user_id', 'totp', 'aal2');
select ok(platform.has_grant('notizen'), 'aal2 session may use apps');
select pg_temp.login_as(:'owner_id', 'totp', 'aal2');
select ok(platform.is_admin(), 'aal2 session is admin');

-- A passkey already proves possession of a device.
select pg_temp.login_as(:'user_id', 'webauthn', 'aal1');
select ok(platform.has_grant('notizen'), 'passkey session may use apps without a code');
select tests.logout();

-- An unverified (abandoned) enrolment does not lock anyone out.
delete from auth.mfa_factors where user_id = :'user_id';
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), :'user_id', 'Neu', 'totp', 'unverified', now(), now());
select pg_temp.login_as(:'user_id', 'password', 'aal1');
select ok(platform.has_grant('notizen'), 'unverified factor does not require a code');
select tests.logout();

select is(
  (select array_agg(r.rolname::text order by r.rolname)
   from pg_proc p, aclexplode(p.proacl) a join pg_roles r on r.oid = a.grantee
   where p.oid = 'platform.mfa_ok()'::regprocedure),
  array['authenticated', 'postgres', 'service_role'], 'mfa_ok is not callable by anon');

select * from finish();
rollback;
