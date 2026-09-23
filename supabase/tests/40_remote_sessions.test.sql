begin;
select plan(8);

select tests.create_user('owner@example.com', 'Owner') as owner_id \gset
select tests.create_user('anna@example.com', 'Anna') as anna_id \gset
select tests.create_user('jonas@example.com', 'Jonas') as jonas_id \gset
update platform.profiles set role = 'trusted' where user_id in (:'anna_id', :'jonas_id');

insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, owner_id, status)
values ('haushaltsbuch', 'Haushaltsbuch', 'Windows app', 'remote', 'remote', '{}', 'shared-account', :'owner_id', 'online');
insert into platform.app_grants (user_id, app_slug) values (:'anna_id', 'haushaltsbuch'), (:'jonas_id', 'haushaltsbuch');

select (platform.remote_request('haushaltsbuch', :'anna_id')).id as anna_session \gset
select is((select status from platform.remote_sessions where id = :'anna_session'), 'active', 'first requester gets the session');

select (platform.remote_request('haushaltsbuch', :'jonas_id')).status as jonas_status \gset
select is(:'jonas_status'::text, 'queued'::text, 'second requester is queued');

select is((platform.remote_request('haushaltsbuch', :'anna_id')).id, :'anna_session'::uuid,
  'requesting again returns the existing session');

select tests.login(:'jonas_id');
select results_eq(
  $$select active_user_name, queue_length, my_position, is_mine from platform.remote_status()$$,
  $$values ('Anna'::text, 1, 1, false)$$,
  'status shows who is connected and the queue position');
select tests.logout();

select is((platform.remote_end(:'anna_session')).user_id, :'jonas_id'::uuid, 'ending promotes the next in queue');
select is((select count(*)::int from platform.remote_sessions where status = 'active'), 1, 'still exactly one active session');

update platform.remote_sessions set last_seen_at = now() - interval '1 hour' where status = 'active';
select is(platform.remote_expire_idle(interval '15 minutes'), 1, 'idle sessions expire');

select tests.login(:'anna_id');
select throws_ok(format('select platform.remote_request(%L, %L)', 'haushaltsbuch', :'anna_id'),
  '42501', null, 'users cannot manipulate the queue directly');
select tests.logout();

select * from finish();
rollback;
