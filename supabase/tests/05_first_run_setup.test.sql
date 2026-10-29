begin;
select plan(5);
select tests.reset();

select ok(platform.needs_setup(), 'a fresh installation needs setup');
select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select ok(not platform.needs_setup(), 'setup is closed once an account exists');
select is((select role::text from platform.profiles where user_id = :'owner_id'), 'admin',
  'the first account is the admin without an invite');
select tests.create_user('later@example.com', 'Later') as later_id \gset
select is((select role::text from platform.profiles where user_id = :'later_id'), 'user',
  'later accounts are not');
select tests.login(:'later_id');
select throws_ok($$select platform.needs_setup()$$, '42501', null,
  'signed-in users cannot call it');

select * from finish();
rollback;
