begin;
select plan(26);
select tests.reset();

select tests.create_user('anna@example.com', 'Anna') as anna \gset
select tests.create_user('ben@example.com', 'Ben') as ben \gset
select tests.create_user('cleo@example.com', 'Cleo') as cleo \gset
select tests.create_user('dan@example.com', 'Dan') as dan \gset
update platform.profiles set role = 'trusted' where user_id in (:'anna', :'ben', :'cleo', :'dan');
insert into platform.apps (slug, name, description, kind, target, manifest, data_mode, status) values
  ('projekte', 'Projekte', 'x', 'spa', 'cloudflare', '{}', 'team', 'online'),
  ('andere', 'Andere', 'x', 'spa', 'cloudflare', '{}', 'team', 'online');
-- Dan has no access to the app.
insert into platform.app_grants (user_id, app_slug) values
  (:'anna', 'projekte'), (:'ben', 'projekte'), (:'cleo', 'projekte'), (:'anna', 'andere');

select platform.create_app_schema('projekte');
create table app_projekte.cards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  created_by uuid,
  title text not null
);
select platform.secure_table('projekte', 'cards', 'team');
select is((select count(*)::int from pg_constraint where conrelid = 'app_projekte.cards'::regclass
  and contype = 'f' and confrelid = 'platform.teams'::regclass), 1, 'secure_table adds the foreign key to the team');
create table app_projekte.loose (id uuid primary key, title text);
select throws_like($$select platform.secure_table('projekte', 'loose', 'team')$$, '%needs a team_id%',
  'a team table needs team_id');

-- Anna makes a team and invites Ben as editor and Cleo as viewer.
select tests.login(:'anna');
select tests.as_app('projekte');
select platform.team_create('projekte', 'Bandprojekt') as team \gset
select is((select role::text from platform.team_list('projekte')), 'owner', 'the creator is the owner');
select platform.team_set_member(:'team', :'ben', 'editor');
select platform.team_set_member(:'team', :'cleo', 'viewer');
select throws_ok(format($$select platform.team_set_member(%L, %L, 'editor')$$, :'team', :'dan'), '22023', null,
  'people without access to the app cannot join');
insert into app_projekte.cards (team_id, title) values (:'team', 'Songs auswählen');
select is((select created_by from app_projekte.cards), :'anna'::uuid, 'created_by is filled with the author');
select is((select count(*)::int from platform.team_members_of(:'team')), 3, 'members see each other');

-- Ben (editor)
select tests.logout(); select tests.login(:'ben'); select tests.as_app('projekte');
select is((select count(*)::int from app_projekte.cards), 1, 'an editor reads the team''s rows');
update app_projekte.cards set title = 'Songs sammeln';
select is((select title from app_projekte.cards), 'Songs sammeln', 'an editor writes');
select lives_ok(format($$select platform.team_notify(%L, %L, 'Neue Aufgabe', 'Songs')$$, :'team', :'anna'),
  'an editor notifies a member');
select throws_ok(format($$select platform.team_set_member(%L, %L, 'owner')$$, :'team', :'ben'), '42501', null,
  'an editor cannot manage the team');
select ok(platform.may_access_app_file('projekte/team-' || :'team' || '/a.png'), 'an editor reads team files');
select ok(platform.may_write_app_file('projekte/team-' || :'team' || '/a.png'), 'an editor writes team files');

-- Cleo (viewer)
select tests.logout(); select tests.login(:'cleo'); select tests.as_app('projekte');
select is((select count(*)::int from app_projekte.cards), 1, 'a viewer reads');
select throws_ok(format($$insert into app_projekte.cards (team_id, title) values (%L, 'x')$$, :'team'), '42501', null,
  'a viewer cannot add rows');
update app_projekte.cards set title = 'hacked';
select is((select title from app_projekte.cards), 'Songs sammeln', 'a viewer cannot change rows');
select ok(not platform.may_write_app_file('projekte/team-' || :'team' || '/a.png'), 'a viewer cannot write team files');
select throws_ok(format($$select platform.team_notify(%L, %L, 'x')$$, :'team', :'anna'), '42501', null,
  'a viewer cannot notify');

-- Not a member / another app / no access
select tests.logout(); select tests.login(:'anna'); select tests.as_app('andere');
select is((select count(*)::int from app_projekte.cards), 0, 'the same person on another app''s page sees nothing');
select is((select count(*)::int from platform.team_list('projekte')), 0, 'teams are listed only on their own app''s page');
select tests.as_app('projekte');
select platform.team_create('projekte', 'Anderes Team') as other \gset
select tests.logout(); select tests.login(:'ben'); select tests.as_app('projekte');
select is((select count(*)::int from platform.team_list('projekte')), 1, 'a member sees only their own teams');
select throws_ok(format($$insert into app_projekte.cards (team_id, title) values (%L, 'x')$$, :'other'), '42501', null,
  'rows cannot be added to a team the person is not in');
select ok(not platform.may_access_app_file('projekte/team-' || :'other' || '/a.png'), 'files of other teams are closed');

-- Owners and the last owner
select tests.logout(); select tests.login(:'anna'); select tests.as_app('projekte');
select throws_ok(format($$select platform.team_remove_member(%L, %L)$$, :'team', :'anna'), '22023', null,
  'the last owner cannot leave');
select platform.team_remove_member(:'team', :'cleo');
select is((select count(*)::int from platform.team_members_of(:'team')), 2, 'an owner removes a member');
select platform.team_delete(:'team');
select is((select count(*)::int from app_projekte.cards), 0, 'deleting the team deletes its rows');

select tests.logout();
set local role anon;
select throws_ok($$select * from platform.team_list('projekte')$$, '42501', null, 'not for anonymous callers');
reset role;

select * from finish();
rollback;
