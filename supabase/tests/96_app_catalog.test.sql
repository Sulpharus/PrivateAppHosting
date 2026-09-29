begin;
select plan(42);
select tests.reset();

-- The first user becomes admin (bootstrap); the others are normal users.
select tests.create_user('admin@example.com') as admin_id \gset
select tests.create_user('user@example.com') as user_id \gset
select tests.create_user('friend@example.com') as friend_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('haushalt', 'Haushalt', 'Einnahmen und Ausgaben, Budgets', 'static', 'cloudflare', '{}', 'online'),
  ('rezepte', 'Rezepte', 'Kochen für die Woche', 'static', 'cloudflare', '{}', 'online'),
  ('geheim', 'Geheim', 'Nur für manche', 'static', 'cloudflare', '{}', 'online'),
  ('xyz', 'Xyz', 'Nichts Bekanntes', 'static', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'user_id', 'haushalt'), (:'user_id', 'rezepte'), (:'user_id', 'xyz'),
  (:'user_id', 'geheim'), (:'friend_id', 'geheim');

-- Automatic categories from name and description.
select is((select category_id from platform.apps where slug = 'haushalt'), 'haushalt',
  'a new app gets a category from its words');
select is((select category_id from platform.apps where slug = 'rezepte'), 'kochen',
  'the description counts too');
select is((select category_id from platform.apps where slug = 'xyz'), null,
  'no matching word, no category');

-- The admin sets a category by hand; deploys (renames) keep it; null goes back to automatic.
select tests.login(:'admin_id');
select lives_ok($$select platform.admin_set_app_category('rezepte', 'familie')$$,
  'the admin sets a category');
select tests.logout();
update platform.apps set description = 'Rezepte kochen, neu' where slug = 'rezepte';
select is((select category_id from platform.apps where slug = 'rezepte'), 'familie',
  'a redeploy keeps the manual category');

-- Custom categories: created by the admin, they sort apps automatically.
select tests.login(:'admin_id');
insert into platform.app_categories (id, name, keywords) values ('extra', 'Extra', '{xyz}');
select is((select category_id from platform.apps where slug = 'xyz'), 'extra',
  'a custom category picks up matching apps');
select throws_ok($$insert into platform.app_categories (id, name, keywords) values ('gross', 'Groß', '{ABC}')$$,
  '23514', null, 'keywords are lower case');
select platform.admin_delete_category('extra');
select is((select category_id from platform.apps where slug = 'xyz'), null,
  'deleting a category re-sorts its apps');
select platform.admin_delete_category('familie');
select is((select category_id from platform.apps where slug = 'rezepte'), 'kochen',
  'an app whose manual category is deleted goes back to automatic');
select is((select category_manual from platform.apps where slug = 'rezepte'), false,
  '… and is automatic again');

-- A stale sign-in is refused loudly (the portal then asks to sign in again).
select tests.login(:'admin_id', 3600);
select throws_ok($$select platform.admin_delete_category('sport')$$, '42501', null,
  'deleting a category needs a recent sign-in');
select throws_ok($$select platform.admin_set_app_category('haushalt', 'sport')$$, '42501', null,
  'recategorising needs a recent sign-in');
select throws_ok($$select platform.admin_save_link('wiki', 'Wiki', 'x', 'https://de.wikipedia.org')$$,
  '42501', null, 'adding a link needs a recent sign-in');

-- Only admins change categories, sets and links.
select tests.login(:'user_id');
select throws_ok($$insert into platform.app_categories (id, name) values ('x', 'X')$$, '42501',
  null, 'users cannot create categories');
select throws_ok($$select platform.admin_set_app_category('haushalt', 'sport')$$, '42501', null,
  'users cannot recategorise apps');
select throws_ok($$select platform.admin_save_link('wiki', 'Wiki', 'x', 'https://de.wikipedia.org')$$,
  '42501', null, 'users cannot add link tiles (which would grant everyone)');
select is((select count(*)::int from platform.app_categories), 8, 'users see all categories');

-- Sets: the admin curates; users see the items of apps they may open.
select tests.login(:'admin_id');
select platform.admin_save_set(null, 'Zuhause', null, 1, array['haushalt', 'geheim', 'fehlt']) as set_id \gset
select is((select count(*)::int from platform.app_set_items), 2, 'unknown apps are skipped');
select tests.login(:'friend_id');
select is((select array_agg(app_slug) from platform.app_set_items), array['geheim'],
  'users only see set items of their apps');
select throws_ok($$select platform.admin_save_set(null, 'Meins', null, 1, array['geheim'])$$,
  '42501', null, 'users cannot create sets');

-- Favourites and usage are per user and need access to the app.
select tests.login(:'user_id');
select lives_ok($$insert into platform.app_favorites (app_slug) values ('haushalt')$$,
  'a user marks an app as favourite');
select tests.login(:'friend_id');
select throws_ok($$insert into platform.app_favorites (app_slug) values ('haushalt')$$, '42501',
  null, 'no favourites of apps without access');
select tests.login(:'user_id');
select platform.record_app_open('haushalt');
select platform.record_app_open('haushalt');
select is((select opens from platform.app_opens where app_slug = 'haushalt'), 2,
  'opening an app counts');
select tests.login(:'friend_id');
select throws_ok($$select platform.record_app_open('haushalt')$$, '42501', null,
  'no counting of apps without access');
select tests.login(:'admin_id');
select is((select count(*)::int from platform.app_favorites), 0,
  'favourites are private, also from the admin');

-- Link tiles.
select lives_ok($$select platform.admin_save_link('wiki', 'Wiki', 'Nachschlagen', 'https://de.wikipedia.org')$$,
  'the admin adds a link tile');
select is((select count(*)::int from platform.app_grants where app_slug = 'wiki'), 3,
  '"for all" grants it to everyone');
select throws_ok($$select platform.admin_save_link('haushalt', 'X', 'x', 'https://example.com')$$,
  '23505', null, 'a hosted app cannot become a link');
select throws_ok($$select platform.admin_save_link('admin', 'X', 'x', 'https://example.com')$$,
  '22023', null, 'reserved slugs are refused');
select throws_ok($$select platform.admin_delete_link('haushalt')$$, 'P0002', null,
  'deleting a link never deletes a hosted app');

-- Whitelist: only the listed people keep access; nothing grants it automatically.
select platform.admin_set_whitelist('geheim', true, array[:'friend_id'::uuid]);
select is((select array_agg(user_id) from platform.app_grants where app_slug = 'geheim'),
  array[:'friend_id'::uuid], 'only the listed people keep access');
select throws_ok($$select platform.admin_set_app_state('geheim', null, true)$$, '23514', null,
  'a whitelist app cannot be granted to all new users');
select platform.admin_set_whitelist('geheim', true, array[:'friend_id'::uuid, null]);
select platform.admin_save_set(null, 'Geheimset', null, 2, array['geheim']);
select is((select count(*)::int from platform.app_grants where app_slug = 'geheim'), 1,
  'a null in the list does not keep everyone');
-- A whitelisted link stays whitelisted when saved "for all".
select platform.admin_set_whitelist('wiki', true, '{}');
select platform.admin_save_link('wiki', 'Wiki', 'Nachschlagen', 'https://de.wikipedia.org', true);
select is((select count(*)::int from platform.app_grants where app_slug = 'wiki'), 0,
  'saving a whitelisted link "for all" grants nobody');
select is((select is_default from platform.apps where slug = 'wiki'), false,
  '… and it is not granted to new users');
select tests.login(:'admin_id', 3600);
select throws_ok($$select platform.admin_set_whitelist('geheim', false, null)$$, '42501', null,
  'changing the whitelist needs a recent sign-in');
select tests.login(:'user_id');
select throws_ok($$select platform.admin_set_whitelist('geheim', false, null)$$, '42501', null,
  'users cannot change the whitelist');
select is((select count(*)::int from platform.apps where slug = 'geheim'), 0,
  'people not on the whitelist do not see the app');
select is((select array_agg(name) from platform.app_sets), array['Zuhause'],
  'sets without an app of the user stay hidden');
select tests.logout();
select tests.create_user('late@example.com') as late_id \gset
select is((select count(*)::int from platform.app_grants where user_id = :'late_id' and app_slug = 'geheim'),
  0, 'new users do not get whitelist apps');
select tests.login(:'admin_id');
select platform.admin_set_whitelist('geheim', false, null);
select is((select count(*)::int from platform.app_grants where app_slug = 'geheim'), 1,
  'opening the app again keeps the existing grants');

select tests.logout();
select throws_ok($$insert into platform.apps (slug, name, description, kind, target, manifest)
  values ('bad', 'Bad', 'x', 'link', 'external', '{}')$$, '23514', null,
  'a link tile needs a URL');

select * from finish();
rollback;
