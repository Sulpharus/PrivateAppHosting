-- The AI models the proxy calls (Verwaltung → KI-Proxy): admins read and change them with a recent
-- sign-in; nobody else sees or changes them.
begin;
select plan(11);
select tests.reset();

select tests.create_user('admin@example.com', 'Admin') as admin_id \gset
select tests.create_user('user@example.com', 'User') as user_id \gset
update platform.profiles set role = 'admin' where user_id = :'admin_id';

select tests.login(:'user_id');
select is((select count(*)::int from platform.ai_models), 0, 'a user does not see the models');
update platform.ai_models set model_id = 'evil-model' where alias = 'claude-haiku';

select tests.login(:'admin_id');
select is((select count(*)::int from platform.ai_models), 4, 'the admin sees all four aliases');
select is((select model_id from platform.ai_models where alias = 'claude-haiku'), 'claude-haiku-5-5',
  'a user''s update changed nothing');
update platform.ai_models set model_id = 'claude-haiku-6', input_eur_per_mtok = 0.2
  where alias = 'claude-haiku';
select is((select updated_by from platform.ai_models where alias = 'claude-haiku'), :'admin_id'::uuid,
  'the admin changes a model and is recorded');

select tests.login(:'admin_id', 3600);
select throws_ok(
  $$update platform.ai_models set model_id = 'claude-haiku-7' where alias = 'claude-haiku'$$,
  '42501', null, 'a change needs a recent sign-in');

select tests.login(:'admin_id');
select throws_ok(
  $$update platform.ai_models set effort = 'low' where alias = 'gemini-flash'$$,
  '23514', null, 'effort is only for Claude models');
select throws_ok(
  $$update platform.ai_models set model_id = 'Bad Model!' where alias = 'gemini-pro'$$,
  '23514', null, 'model ids are checked');

select throws_ok(
  $$update platform.ai_models set input_eur_per_mtok = 0 where alias = 'gemini-pro'$$,
  '23514', null, 'a price of 0 would switch the budgets off');
select throws_ok(
  $$insert into platform.ai_models (alias, model_id, input_eur_per_mtok, output_eur_per_mtok)
    values ('gemini-flash', 'x-model', 1, 1)$$,
  '42501', null, 'the admin cannot add aliases');
select throws_ok($$delete from platform.ai_models$$, '42501', null, 'the admin cannot delete aliases');
select tests.logout();
select ok(not has_table_privilege('anon', 'platform.ai_models', 'SELECT'), 'anon gets nothing');

select * from finish();
rollback;
