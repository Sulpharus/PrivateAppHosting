begin;
select plan(5);
select tests.reset();

select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status)
values ('notizen', 'Notizen', 'Notes', 'spa', 'cloudflare', '{}', 'online');

select tests.login(:'user_id');
select throws_ok($$select platform.admin_set_app_state('notizen', true)$$, '42501', null,
  'users cannot change app state');
select throws_ok($$select * from platform.admin_ai_usage()$$, '42501', null, 'users cannot read AI usage');

select tests.login(:'owner_id', 30);
select lives_ok($$select platform.admin_set_app_state('notizen', true, true)$$, 'admin disables and defaults an app');
select tests.logout();
select results_eq(
  $$select status::text, is_default from platform.apps where slug = 'notizen'$$,
  $$values ('disabled', true)$$, 'state is stored');

select tests.login(:'owner_id', 30);
select platform.admin_set_app_state('notizen', false);
select tests.logout();
select is((select status::text from platform.apps where slug = 'notizen'), 'online', 're-enabling restores online');

select * from finish();
rollback;
