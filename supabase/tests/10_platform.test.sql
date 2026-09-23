begin;
select plan(17);

-- The first user of a fresh project is the admin.
select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select is(
  (select role::text from platform.profiles where user_id = :'owner_id'),
  'admin', 'first user becomes admin');

insert into platform.apps (slug, name, description, kind, target, manifest, is_default, status)
values
  ('notizen', 'Notizen', 'Notes', 'spa', 'cloudflare', '{}', true, 'online'),
  ('budget', 'Budget', 'Money', 'spa', 'cloudflare', '{}', false, 'online'),
  ('tresor', 'Tresor', 'Admin only', 'spa', 'cloudflare', '{}', false, 'online');
update platform.apps set allowed_roles = '{admin}' where slug = 'tresor';

-- An invite decides role and extra grants of the invited user.
insert into platform.invites (email, role, app_slugs, created_by, expires_at)
values ('Anna@Example.com', 'trusted', '{budget,tresor}', :'owner_id', now() + interval '7 days');
select tests.create_user('anna@example.com', 'Anna') as anna_id \gset
select is((select role::text from platform.profiles where user_id = :'anna_id'),
  'trusted', 'invite role is applied (email match is case-insensitive)');
select ok((select accepted_at is not null from platform.invites where lower(email) = 'anna@example.com'),
  'invite is marked accepted');
select set_eq(
  $$select app_slug from platform.app_grants where user_id = '$$ || :'anna_id' || $$'$$,
  array['notizen', 'budget'],
  'default apps + invited apps are granted, apps not allowed for the role are skipped');

-- Expired invites are ignored.
insert into platform.invites (email, role, created_by, expires_at, created_at)
values ('late@example.com', 'trusted', :'owner_id', now() - interval '1 day', now() - interval '8 days');
select tests.create_user('late@example.com') as late_id \gset
select is((select role::text from platform.profiles where user_id = :'late_id'),
  'user', 'expired invite falls back to the user role');

-- has_grant
select tests.login(:'anna_id');
select ok(platform.has_grant('budget'), 'granted app is usable');
select ok(not platform.has_grant('tresor'), 'app outside the role is not usable');
select ok(not platform.has_grant('does-not-exist'), 'unknown app is not usable');
select is((select count(*)::int from platform.apps), 2, 'users only see apps they may use');
select is((select count(*)::int from platform.profiles), 1, 'users only see their own profile');
select is((select count(*)::int from platform.invites), 0, 'users cannot read invites');

-- Users cannot escalate.
select throws_ok(
  format('update platform.profiles set role = %L where user_id = %L', 'admin', :'anna_id'),
  '42501', null, 'role column is not updatable by users');
select throws_ok(
  format('select platform.admin_set_role(%L, %L)', :'late_id', 'trusted'),
  '42501', null, 'non-admins cannot change roles');
select throws_ok(
  format('insert into platform.app_grants (user_id, app_slug) values (%L, %L)', :'anna_id', 'tresor'),
  '42501', null, 'users cannot grant themselves apps');

-- Admin actions need a recent sign-in (step-up).
select tests.login(:'owner_id', 3600);
select throws_ok(
  format('select platform.admin_set_role(%L, %L)', :'late_id', 'trusted'),
  '42501', null, 'stale admin session cannot change roles');
select tests.login(:'owner_id', 30);
select lives_ok(
  format('select platform.admin_set_role(%L, %L)', :'late_id', 'trusted'),
  'fresh admin session can change roles');
select tests.logout();

-- The access token hook adds the role claim.
select is(
  platform.custom_access_token_hook(jsonb_build_object('user_id', :'anna_id', 'claims', '{}'::jsonb))
    -> 'claims' ->> 'mn_role',
  'trusted', 'access token carries mn_role');

select * from finish();
rollback;
