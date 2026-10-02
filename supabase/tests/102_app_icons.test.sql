begin;
select plan(7);
select tests.reset();

select tests.create_user('admin@example.com') as admin_id \gset
select tests.create_user('user@example.com') as user_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('rezepte', 'Rezepte', 'Kochen für die Woche', 'static', 'cloudflare', '{}', 'online');

select tests.login(:'admin_id');
select lives_ok($$select platform.admin_set_app_icon('rezepte', 'rezepte-1.webp')$$, 'the admin sets a logo');
select is((select icon_path from platform.apps where slug = 'rezepte'), 'rezepte-1.webp', 'it is saved');
select throws_ok($$select platform.admin_set_app_icon('rezepte', '../x.webp')$$, '23514', null,
  'a path outside the bucket namespace is refused');
select lives_ok($$select platform.admin_set_app_icon('rezepte', null)$$, 'null goes back to the monogram');
select tests.logout();

select tests.login(:'user_id');
select throws_ok($$select platform.admin_set_app_icon('rezepte', 'x.webp')$$, '42501', null,
  'users cannot set logos');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('app-icons', 'evil.webp')$$,
  '42501', null, 'users cannot write to the logo bucket');
select tests.logout();
select ok((select public from storage.buckets where id = 'app-icons'), 'the logo bucket is public');

select * from finish();
rollback;
