begin;
select plan(5);
select tests.reset();

select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
insert into platform.google_grants (user_id, google_sub, email, scopes, refresh_token_enc)
values (:'owner_id', '1234', 'owner@gmail.com', '{https://www.googleapis.com/auth/calendar}', 'x');

select ok(
  (select relrowsecurity from pg_class where oid = 'platform.google_grants'::regclass),
  'google_grants has RLS enabled');

select ok(
  not has_table_privilege('anon', 'platform.google_grants', 'select, insert, update, delete'),
  'anon has no privileges on google_grants');

-- Not even the owner (or an admin) reads the encrypted token directly; only the API does.
select tests.login(:'owner_id');
select throws_ok('select * from platform.google_grants', '42501', null,
  'signed-in users cannot read google_grants');
select throws_ok(
  format('delete from platform.google_grants where user_id = %L', :'owner_id'),
  '42501', null, 'signed-in users cannot change google_grants');
select tests.logout();

delete from auth.users where id = :'owner_id';
select is((select count(*)::int from platform.google_grants), 0,
  'the grant disappears with the account');

select * from finish();
rollback;
