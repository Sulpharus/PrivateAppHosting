begin;
select plan(9);

select tests.create_user('owner@example.com') as owner_id \gset
select tests.create_user('user@example.com') as user_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status)
values ('chat', 'Chat', 'AI chat', 'spa', 'cloudflare', '{}', 'online');

-- Role default for users is 2 € (2_000_000 micro-euros).
select platform.ai_reserve(:'user_id', 'chat', 'gemini-flash', 1500000) as r1 \gset
select is((select status from platform.ai_usage where id = :'r1'), 'reserved', 'reservation is open');
select throws_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'user_id', 'chat', 'gemini-flash', 600000),
  'budget_exceeded:user', 'open reservations count against the budget');

select platform.ai_settle(:'r1', 100000, 1000, 500);
select is((select cost_micro from platform.ai_usage where id = :'r1'), 100000::bigint, 'settle records real cost');
select lives_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'user_id', 'chat', 'gemini-flash', 600000),
  'settling frees the unused part of the reservation');

-- App budget applies across users.
insert into platform.ai_budgets (scope, scope_key, monthly_limit_micro) values ('app', 'chat', 800000);
select throws_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'user_id', 'chat', 'gemini-flash', 200000),
  'budget_exceeded:app', 'app limit enforced');

-- A per-user override replaces the role default and is checked first.
insert into platform.ai_budgets (scope, scope_key, monthly_limit_micro) values ('user', :'user_id', 500000);
select throws_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'user_id', 'chat', 'gemini-flash', 1),
  'budget_exceeded:user', 'user override is enforced before app limits');

-- The admin is exempt from app/global limits.
select lives_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'owner_id', 'chat', 'claude-sonnet', 50000000),
  'admin is not bound by app or global limits');

-- Users cannot call the budget functions directly.
select tests.login(:'user_id');
select throws_ok(
  format('select platform.ai_reserve(%L, %L, %L, %s)', :'user_id', 'chat', 'gemini-flash', 1),
  '42501', null, 'reserve is service-role only');
select is((select count(*)::int from platform.ai_usage), 2, 'users see only their own usage rows');
select tests.logout();

select * from finish();
rollback;
