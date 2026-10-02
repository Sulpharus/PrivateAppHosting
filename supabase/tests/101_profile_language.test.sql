begin;
select plan(7);
select tests.reset();

select tests.create_user('admin@example.com') as admin_id \gset
select tests.create_user('anna@example.com') as anna_id \gset
select tests.create_user('ben@example.com') as ben_id \gset

select is((select language from platform.profiles where user_id = :'anna_id'), 'de', 'German is the default');

select tests.login(:'anna_id');
select lives_ok($$update platform.profiles set language = 'en' where user_id = (select auth.uid())$$,
  'a person switches their own language');
select is((select language from platform.profiles where user_id = (select auth.uid())), 'en', 'it is saved');
select throws_ok($$update platform.profiles set language = 'fr' where user_id = (select auth.uid())$$,
  '23514', null, 'only the offered languages are accepted');

select tests.login(:'ben_id');
select is_empty(format($f$update platform.profiles set language = 'en' where user_id = %L returning 1$f$, :'anna_id'),
  'nobody changes the language of someone else');
select tests.logout();
select ok(not has_column_privilege('anon', 'platform.profiles', 'language', 'update'), 'anonymous visitors cannot change it');
select is((select language from platform.profiles where user_id = :'anna_id'), 'en', 'the other person is unchanged');

select * from finish();
rollback;
