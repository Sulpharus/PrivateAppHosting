begin;
select plan(12);
select tests.reset();

select tests.create_user('lena@example.com', 'Lena') as lena \gset
select tests.create_user('tom@example.com', 'Tom') as tom \gset
select tests.create_user('mia@example.com', 'Mia') as mia \gset
select tests.create_user('ole@example.com', 'Ole') as ole \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('wunsch', 'Wunsch', 'x', 'spa', 'cloudflare', '{}', 'online'),
  ('other', 'Andere', 'x', 'spa', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'lena', 'wunsch'), (:'tom', 'wunsch'), (:'mia', 'wunsch'), (:'tom', 'other');

select tests.login(:'tom');
select platform.set_my_birthday(3, 14, 1990, true);
select is((select month from platform.my_birthday()), 3::smallint, 'a person reads their own birthday');
select tests.logout(); select tests.login(:'mia');
select platform.set_my_birthday(11, 2, null, false);   -- not shared
select tests.logout(); select tests.login(:'ole');
select platform.set_my_birthday(7, 9, null, true);     -- shared, but no access to the app
select tests.logout();

select tests.login(:'lena'); select tests.as_app('wunsch');
select is((select array_agg(display_name order by display_name) from platform.app_birthdays('wunsch')),
  array['Tom'], 'only shared birthdays of people who can use the app');
select is((select year from platform.app_birthdays('wunsch')), 1990::smallint, 'the year is there when given');
select tests.as_app('other');
select is((select count(*)::int from platform.app_birthdays('wunsch')), 0, 'only from the app''s own page');
select tests.as_app('wunsch');
select platform.set_my_birthday(5, 5, null, true);
select tests.logout(); select tests.login(:'tom'); select tests.as_app('wunsch');
select is((select count(*)::int from platform.app_birthdays('wunsch')), 1, 'the caller''s own birthday is left out');
select is((select year from platform.app_birthdays('wunsch')), null, 'no year when the person left it out');
select tests.logout();

select tests.login(:'mia');
select throws_ok($$select platform.set_my_birthday(2, 30, null, false)$$, '23514', null, '30 February does not exist');
select throws_ok($$select platform.set_my_birthday(2, 29, 2023, false)$$, '23514', null, '29 February needs a leap year');
select lives_ok($$select platform.set_my_birthday(2, 29, 2024, false)$$, '29 February in a leap year');
select platform.set_my_birthday(null, null, null, true);
select is((select shared from platform.my_birthday()), false, 'clearing the birthday also stops sharing');
select throws_ok($$update platform.profiles set birthday_day = 3$$, '42501', null, 'no direct writes');
select tests.logout();
set local role anon;
select throws_ok($$select * from platform.my_birthday()$$, '42501', null, 'not for anonymous callers');
reset role;

select * from finish();
rollback;
