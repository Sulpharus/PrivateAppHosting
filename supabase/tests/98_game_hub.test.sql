begin;
select plan(41);
select tests.reset();

select tests.create_user('lena@example.com', 'Lena') as lena_id \gset
select tests.create_user('tom@example.com', 'Tom') as tom_id \gset
select tests.create_user('mia@example.com', 'Mia') as mia_id \gset
insert into platform.apps (slug, name, description, kind, target, manifest, status) values
  ('memory', 'Memory', 'x', 'static', 'cloudflare',
   '{"game":{"genre":"puzzle","players":"solo","stats":[{"id":"moves","label":"Züge","better":"lower","format":"number"},{"id":"time","label":"Zeit","better":"lower","format":"seconds"}]}}',
   'online'),
  ('quiz', 'Quiz', 'x', 'static', 'cloudflare',
   '{"game":{"genre":"quiz","stats":[{"id":"score","label":"Punkte","better":"higher","min":1,"max":100}]}}', 'online'),
  ('notes', 'Notizen', 'x', 'static', 'cloudflare', '{}', 'online');
insert into platform.app_grants (user_id, app_slug) values
  (:'lena_id', 'memory'), (:'lena_id', 'quiz'), (:'lena_id', 'notes'), (:'tom_id', 'memory');

-- Username: one per person, unique regardless of case, validated.
select tests.login(:'lena_id');
select lives_ok($$select platform.game_set_username('Lena_92')$$, 'a username can be set');
select is((select username from platform.game_profile()), 'Lena_92', 'and read back');
select tests.login(:'tom_id');
select throws_ok($$select platform.game_set_username('lena_92')$$, '23505', 'username_taken',
  'usernames are unique regardless of case');
select throws_ok($$select platform.game_set_username('a b')$$, '22023', 'invalid_username',
  'usernames are validated');
select lives_ok($$select platform.game_set_username('TomTom')$$, 'Tom picks another name');
select throws_ok('select * from platform.game_profiles', '42501', null,
  'the tables are not readable directly');
-- Only the portal changes the name; games may read it, other apps may not.
select tests.as_app('memory');
select throws_ok($$select platform.game_set_username('Hacked')$$, '42501', null,
  'a game cannot rename the player');
select is((select username from platform.game_profile()), 'TomTom', 'a game reads the name');
select tests.login(:'lena_id');
select tests.as_app('notes');
select throws_ok($$select platform.game_set_username('Hacked')$$, '42501', null,
  'nor can any other app');
select is((select count(*)::int from platform.game_profile()), 0,
  'other apps do not read the name');
select tests.as_app(null);

-- Sessions: only from a game page, and time is capped per ping.
select tests.login(:'lena_id');
select tests.as_app('notes');
select throws_ok($$select platform.game_session_start()$$, '42501', 'not_a_game',
  'apps without a game block report nothing');
select tests.as_app(null);
select throws_ok($$select platform.game_session_start()$$, '42501', 'not_a_game',
  'not from outside a game');
select tests.as_app('memory');
select platform.game_session_start() as sid \gset
select tests.logout();
update platform.game_sessions set last_seen_at = now() - interval '40 seconds' where id = :'sid';
select tests.login(:'lena_id');
select tests.as_app('memory');
select is(platform.game_session_ping(:'sid'), 40, 'a ping adds the time since the last one');
select tests.logout();
update platform.game_sessions set last_seen_at = now() - interval '2 hours' where id = :'sid';
select tests.login(:'lena_id');
select tests.as_app('memory');
select is(platform.game_session_ping(:'sid'), 130, 'at most 90 seconds per ping');
select tests.as_app('quiz');
select throws_ok(format('select platform.game_session_ping(%L)', :'sid'), 'P0002', 'unknown_session',
  'another game cannot ping it');
select tests.as_app('memory');
select tests.login(:'tom_id');
select tests.as_app('memory');
select throws_ok(format('select platform.game_session_ping(%L)', :'sid'), 'P0002', 'unknown_session',
  'nor another player');
-- A second tab starts a new session and ends the first: time never counts twice.
select tests.login(:'lena_id');
select tests.as_app('memory');
select platform.game_session_start() as sid2 \gset
select throws_ok(format('select platform.game_session_ping(%L)', :'sid'), 'P0002', 'unknown_session',
  'the older session earns no more time');
select tests.logout();
insert into platform.game_sessions (user_id, app_slug, started_at)
  select :'lena_id', 'memory', now() from generate_series(1, 240);
select tests.login(:'lena_id');
select tests.as_app('memory');
select throws_ok($$select platform.game_session_start()$$, '54000', 'too_many_sessions',
  'session starts are rate-limited');
select tests.logout();
delete from platform.game_sessions where user_id = :'lena_id' and id not in (:'sid', :'sid2');
select tests.login(:'lena_id');

-- Results: only declared numeric stats are kept.
select tests.login(:'lena_id');
select tests.as_app('memory');
select platform.game_result('win', '{"moves": 30, "time": 95, "cheat": 1, "note": "x"}', 95);
select platform.game_result('win', '{"moves": 24, "time": 120}', 120);
select platform.game_result('loss', '{"moves": 50}', 200);
select throws_ok($$select platform.game_result('great', '{}', 1)$$, '22023', 'invalid_outcome',
  'outcomes are validated');
select platform.game_result('win', '{"moves": -5, "time": "12"}', 10);
select tests.logout();
select is((select stats from platform.game_results where user_id = :'lena_id' and seconds = 10),
  '{}'::jsonb, 'negative and non-numeric values are dropped');
select tests.login(:'lena_id');
select tests.as_app('memory');
select tests.logout();
select is((select stats from platform.game_results where user_id = :'lena_id' and stats ->> 'moves' = '30') ? 'cheat',
  false, 'undeclared stats are dropped');
select tests.login(:'tom_id');
select tests.as_app('memory');
select platform.game_result('win', '{"moves": 20, "time": 80}', 80);

-- Hub: own figures, records by the stat's direction, only games one may play.
select tests.login(:'lena_id');
select tests.as_app(null);
select is((select array_agg(slug order by slug) from platform.game_hub()), array['memory', 'quiz'],
  'the hub lists the games one may play');
select is((select row(seconds, sessions, results, wins, losses)::text from platform.game_hub() where slug = 'memory'),
  '(130,2,4,3,1)', 'playtime, rounds and outcomes');
select is((select records from platform.game_hub() where slug = 'memory'),
  '{"moves": 24, "time": 95}'::jsonb, 'records follow better = lower');
select is((select count(*)::int from platform.game_recent()), 4, 'recent rounds');
select is((select sum(results)::int from platform.game_days(current_date - 7)), 4,
  'rounds per day');
select tests.as_app('memory');
select is((select count(*)::int from platform.game_days(current_date - 7)), 0,
  'a game cannot read the activity across games');
select tests.as_app('quiz');
select is((select count(*)::int from platform.game_recent()), 0,
  'a game sees only its own rounds');

-- Leaderboard: usernames only, the right order, only for people who may play it.
select tests.as_app(null);
select is((select array_agg(username || ':' || value order by rank) from platform.game_leaderboard('memory', 'moves')),
  array['TomTom:20', 'Lena_92:24'], 'fewest moves first');
select is((select mine from platform.game_leaderboard('memory', 'moves') where username = 'Lena_92'),
  true, 'marks the caller');
select is((select count(*)::int from platform.game_leaderboard('memory', 'cheat')), 0,
  'undeclared stats have no board');
select tests.as_app('quiz');
select is((select count(*)::int from platform.game_leaderboard('memory', 'moves')), 0,
  'another game cannot read the board');
select tests.as_app('memory');
select is((select count(*)::int from platform.game_leaderboard('memory', 'moves')), 2,
  'the game itself can');
-- Bounds from the manifest: 0 and 101 are dropped, 100 is kept.
select tests.as_app('quiz');
select platform.game_result('done', '{"score": 0}', 1);
select platform.game_result('done', '{"score": 101}', 2);
select platform.game_result('done', '{"score": 100}', 3);
select tests.logout();
select is((select array_agg(stats::text order by seconds) from platform.game_results
  where user_id = :'lena_id' and app_slug = 'quiz'),
  array['{}', '{}', '{"score": 100}'], 'values outside min..max are dropped');
select tests.login(:'lena_id');
select tests.as_app(null);
select platform.game_set_username(null);
select is((select array_agg(username order by rank) from platform.game_leaderboard('memory', 'moves')),
  array['TomTom'], 'without a username one is not on the board');
select tests.logout();
insert into platform.game_results (user_id, app_slug, outcome)
  select :'tom_id', 'memory', 'done' from generate_series(1, 300);
select tests.login(:'tom_id');
select tests.as_app('memory');
select throws_ok($$select platform.game_result('done', '{}', 1)$$, '54000', 'too_many_results',
  'results are rate-limited');
select tests.login(:'lena_id');
select tests.as_app(null);
select tests.login(:'mia_id');
select is((select count(*)::int from platform.game_leaderboard('memory', 'moves')), 0,
  'nothing for people who may not play it');
select tests.logout();
set local role anon;
select throws_ok($$select * from platform.game_hub()$$, '42501', null, 'not for anonymous callers');
reset role;

-- With a verified authenticator app, a one-factor session may not change the name.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values (gen_random_uuid(), :'mia_id', 'Handy', 'totp', 'verified', now(), now());
select set_config('request.jwt.claims', jsonb_build_object('sub', :'mia_id', 'role', 'authenticated',
  'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'password',
  'timestamp', extract(epoch from now())::bigint)))::text, true);
set local role authenticated;
select throws_ok($$select platform.game_set_username('MiaMia')$$, '42501', null,
  'an aal1 session with a factor cannot set the name');
select set_config('request.jwt.claims', jsonb_build_object('sub', :'mia_id', 'role', 'authenticated',
  'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp',
  'timestamp', extract(epoch from now())::bigint)))::text, true);
select lives_ok($$select platform.game_set_username('MiaMia')$$, 'with aal2 it can');
reset role;
select is((select username from platform.game_profiles where user_id = :'mia_id'), 'MiaMia',
  'the name is stored');

select * from finish();
rollback;
