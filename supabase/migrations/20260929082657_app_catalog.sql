-- App catalog on the start page (ADR 0007): categories (automatic, overridable by the admin,
-- custom ones allowed), favourites and usage per user, curated app sets, link tiles that open an
-- external website instead of a hosted app, and "Nur Whitelist" apps.
--
-- Admin writes that must not silently do nothing go through security-definer functions that
-- raise 42501 without a recent sign-in (the portal then asks for it); only category inserts and
-- updates use RLS directly, where a violation raises as well.

-- ---------- shared checks ----------
create function platform.require_recent_admin() returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) or not (select platform.recent_auth(600)) then
    raise exception 'admin with recent sign-in required' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function platform.require_recent_admin() from public, anon;
grant execute on function platform.require_recent_admin() to authenticated;

-- ---------- link tiles and whitelist ----------
alter table platform.apps drop constraint apps_kind_check;
alter table platform.apps add constraint apps_kind_check
  check (kind in ('static', 'spa', 'nextjs', 'container', 'remote', 'link'));
alter table platform.apps drop constraint apps_target_check;
alter table platform.apps add constraint apps_target_check
  check (target in ('cloudflare', 'vercel', 'nucbox', 'remote', 'external'));
alter table platform.apps add column link_url text
  check (link_url ~ '^https://[^\s/?#@]+\.[^\s/?#@]+(/\S*)?$' and char_length(link_url) <= 500);
alter table platform.apps add constraint link_needs_url
  check ((kind = 'link') = (link_url is not null) and (kind = 'link') = (target = 'external'));
-- Whitelist apps are only for the admin and the people the admin adds: never granted
-- automatically (sign-up, "for all").
alter table platform.apps add column whitelist boolean not null default false;
alter table platform.apps add constraint whitelist_not_default
  check (not (whitelist and is_default));

-- ---------- categories ----------
create table platform.app_categories (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,39}$'),
  name text not null unique check (char_length(name) between 1 and 40),
  -- Lower-case words; an app whose name or description contains one belongs here.
  keywords text[] not null default '{}'
    check (cardinality(keywords) <= 40 and keywords::text = lower(keywords::text)),
  position integer not null default 100,
  created_at timestamptz not null default now()
);
alter table platform.app_categories enable row level security;
revoke all on platform.app_categories from public, anon, authenticated;
grant select, insert, update on platform.app_categories to authenticated;
grant all on platform.app_categories to service_role;
create policy app_categories_read on platform.app_categories for select to authenticated
  using (true);
create policy app_categories_admin_insert on platform.app_categories for insert to authenticated
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));
create policy app_categories_admin_update on platform.app_categories for update to authenticated
  using ((select platform.is_admin()))
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));

insert into platform.app_categories (id, name, keywords, position) values
  ('haushalt', 'Haushalt & Finanzen',
    '{haushalt,budget,finanz,geld,steuer,ausgabe,einnahme,rechnung,konto,vertrag}', 10),
  ('sport', 'Sport & Gesundheit',
    '{sport,fitness,training,gesund,laufen,yoga,schlaf,ernährung,arzt}', 20),
  ('kochen', 'Kochen & Einkaufen', '{rezept,kochen,backen,essen,einkauf,mahlzeit,vorrat}', 30),
  ('familie', 'Familie & Freunde',
    '{familie,freund,geschenk,wunsch,geburtstag,kinder,gemeinsam}', 40),
  ('werkzeuge', 'Werkzeuge',
    '{werkzeug,tool,rechner,konvert,umrechn,generator,editor,scanner}', 50),
  ('wissen', 'Wissen & Lernen', '{lern,wissen,buch,bücher,notiz,idee,sprache,kurs}', 60),
  ('unterhaltung', 'Unterhaltung', '{spiel,film,serie,musik,game,foto,video,quiz,medien}', 70),
  ('arbeit', 'Arbeit & Büro',
    '{büro,arbeit,dokument,mail,office,projekt,kunde,zeiterfassung,automatisier}', 80),
  ('planung', 'Planung & Organisation',
    '{plan,kalender,termin,aufgabe,todo,liste,erinner,organis}', 90);

alter table platform.apps add column category_id text
  references platform.app_categories (id) on delete set null on update cascade;
-- true: the admin chose the category; deploys and keyword changes leave it alone.
alter table platform.apps add column category_manual boolean not null default false;
create index apps_category_id_idx on platform.apps (category_id);

-- The category whose keywords match the app best (a match in the name counts double); ties go
-- to the category listed first. Null when nothing matches.
create function platform.guess_category(p_name text, p_description text)
returns text
language sql
stable
set search_path = ''
as $$
  select c.id
  from platform.app_categories c
  cross join lateral (
    select sum(
      case when position(k in lower(p_name)) > 0 then 2 else 0 end
      + case when position(k in lower(coalesce(p_description, ''))) > 0 then 1 else 0 end
    ) as score
    from unnest(c.keywords) k
    where k <> ''
  ) s
  where s.score > 0
  order by s.score desc, c.position, c.name
  limit 1;
$$;

create function platform.apps_auto_category() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.category_manual then
    new.category_id := platform.guess_category(new.name, new.description);
  end if;
  return new;
end;
$$;
create trigger apps_auto_category before insert or update of name, description, category_manual
  on platform.apps for each row execute function platform.apps_auto_category();

-- New or changed keywords re-sort every automatically categorised app; apps whose manual
-- category was deleted go back to automatic.
create function platform.recategorize_apps() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update platform.apps set category_manual = false
  where category_manual and category_id is null;
  update platform.apps a
  set category_id = platform.guess_category(a.name, a.description)
  where not a.category_manual
    and a.category_id is distinct from platform.guess_category(a.name, a.description);
  -- Audited when a person changed categories (not for the seed below).
  if (select auth.uid()) is not null then
    insert into platform.audit_log (actor_id, action, detail)
    values ((select auth.uid()), 'app_category.' || lower(tg_op), '{}');
  end if;
  return null;
end;
$$;
revoke execute on function platform.recategorize_apps() from public, anon, authenticated;
create trigger app_categories_recategorize
  after insert or update or delete on platform.app_categories
  for each statement execute function platform.recategorize_apps();

update platform.apps set category_id = platform.guess_category(name, description);

-- Admin: a fixed category for an app, or null to go back to automatic.
create function platform.admin_set_app_category(p_slug text, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  update platform.apps
  set category_manual = p_category is not null,
      category_id = coalesce(p_category, platform.guess_category(name, description))
  where slug = p_slug;
  if not found then
    raise exception 'unknown app' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.category_set', jsonb_build_object('category', p_category));
end;
$$;

create function platform.admin_delete_category(p_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  delete from platform.app_categories where id = p_id;
  if not found then
    raise exception 'unknown category' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------- access modes and link tiles ----------
-- Whitelist: exactly `p_users` keep a grant (the admin always has access). Back to open: grants
-- stay as they are; the admin grants the app to more people as before.
create function platform.admin_set_whitelist(p_slug text, p_whitelist boolean, p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- A null element would make `<> all` null for every row and keep everyone.
  v_users uuid[] := array_remove(coalesce(p_users, '{}'), null);
begin
  perform platform.require_recent_admin();
  update platform.apps
  set whitelist = p_whitelist,
      is_default = case when p_whitelist then false else is_default end
  where slug = p_slug;
  if not found then
    raise exception 'unknown app' using errcode = 'P0002';
  end if;
  if p_whitelist then
    delete from platform.app_grants
    where app_slug = p_slug and user_id <> all (v_users);
    insert into platform.app_grants (user_id, app_slug, granted_by)
    select u, p_slug, (select auth.uid())
    from unnest(v_users) u
    where exists (select 1 from platform.profiles p where p.user_id = u)
    on conflict do nothing;
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.whitelist_set',
    jsonb_build_object('whitelist', p_whitelist, 'users', v_users));
end;
$$;

-- "Für alle neuen Nutzer" cannot be switched on for a whitelist app.
create or replace function platform.admin_set_app_state(
  p_slug text,
  p_disabled boolean default null,
  p_is_default boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  if p_is_default is true and exists (
    select 1 from platform.apps where slug = p_slug and whitelist
  ) then
    raise exception 'whitelist apps are never granted automatically' using errcode = '23514';
  end if;
  update platform.apps set
    status = case
      when p_disabled is true then 'disabled'::platform.app_status
      when p_disabled is false and status = 'disabled' then 'online'::platform.app_status
      else status
    end,
    is_default = coalesce(p_is_default, is_default)
  where slug = p_slug;
  if not found then
    raise exception 'unknown app' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.state_changed',
    jsonb_build_object('disabled', p_disabled, 'is_default', p_is_default));
end;
$$;

-- Creates or updates a link tile. `p_for_all` grants it to everyone now and to future users;
-- switching it off later keeps existing grants (use the whitelist to narrow access).
create function platform.admin_save_link(
  p_slug text, p_name text, p_description text, p_url text, p_for_all boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  if p_slug !~ '^[a-z][a-z0-9-]{0,30}[a-z0-9]$' or p_slug ~ '--' or p_slug = any (array[
    'admin', 'ai', 'api', 'auth', 'guac', 'login', 'mail', 'proxmox', 'remote', 'ssh', 'staging',
    'status', 'www'
  ]) then
    raise exception 'invalid or reserved slug' using errcode = '22023';
  end if;
  if exists (select 1 from platform.apps where slug = p_slug and kind <> 'link') then
    raise exception 'slug belongs to a hosted app' using errcode = '23505';
  end if;
  insert into platform.apps
    (slug, name, description, kind, target, link_url, manifest, status, is_default)
  values (p_slug, p_name, p_description, 'link', 'external', p_url, '{}', 'online', p_for_all)
  on conflict (slug) do update
    set name = excluded.name, description = excluded.description, link_url = excluded.link_url,
        is_default = excluded.is_default and not platform.apps.whitelist;
  if p_for_all and not (select whitelist from platform.apps where slug = p_slug) then
    insert into platform.app_grants (user_id, app_slug, granted_by)
    select p.user_id, p_slug, (select auth.uid()) from platform.profiles p
    on conflict do nothing;
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.link_saved', jsonb_build_object('url', p_url));
end;
$$;

create function platform.admin_delete_link(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  delete from platform.apps where slug = p_slug and kind = 'link';
  if not found then
    raise exception 'unknown link' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, app_slug, action, detail)
  values ((select auth.uid()), p_slug, 'app.link_deleted', '{}');
end;
$$;

-- ---------- favourites and usage (per user) ----------
create table platform.app_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);
create index app_favorites_app_slug_idx on platform.app_favorites (app_slug);
alter table platform.app_favorites enable row level security;
revoke all on platform.app_favorites from public, anon, authenticated;
grant select, insert, delete on platform.app_favorites to authenticated;
grant all on platform.app_favorites to service_role;
create policy app_favorites_own on platform.app_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (select platform.has_grant(app_slug)));

create table platform.app_opens (
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  opens integer not null default 0,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);
create index app_opens_app_slug_idx on platform.app_opens (app_slug);
alter table platform.app_opens enable row level security;
revoke all on platform.app_opens from public, anon, authenticated;
grant select on platform.app_opens to authenticated;
grant all on platform.app_opens to service_role;
create policy app_opens_own on platform.app_opens for select to authenticated
  using (user_id = (select auth.uid()));

-- The portal calls this when a tile is opened ("Meistgenutzt").
create function platform.record_app_open(p_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select platform.has_grant(p_slug)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into platform.app_opens (user_id, app_slug, opens)
  values ((select auth.uid()), p_slug, 1)
  on conflict (user_id, app_slug) do update
    set opens = platform.app_opens.opens + 1, last_opened_at = now();
end;
$$;

-- ---------- curated app sets (written through the functions below) ----------
create table platform.app_sets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text check (char_length(description) <= 200),
  position integer not null default 100,
  created_at timestamptz not null default now()
);
create table platform.app_set_items (
  set_id uuid not null references platform.app_sets (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  position integer not null default 0,
  primary key (set_id, app_slug)
);
create index app_set_items_app_slug_idx on platform.app_set_items (app_slug);
alter table platform.app_sets enable row level security;
alter table platform.app_set_items enable row level security;
revoke all on platform.app_sets, platform.app_set_items from public, anon, authenticated;
grant select on platform.app_sets, platform.app_set_items to authenticated;
grant all on platform.app_sets, platform.app_set_items to service_role;
-- A set is visible when it holds at least one app the user may open (names of sets made of
-- whitelist apps stay private).
create policy app_sets_read on platform.app_sets for select to authenticated
  using (
    (select platform.is_admin())
    or exists (
      select 1 from platform.app_set_items i
      where i.set_id = app_sets.id and platform.has_grant(i.app_slug)
    )
  );
-- Users see only the items of apps they may open.
create policy app_set_items_read on platform.app_set_items for select to authenticated
  using ((select platform.is_admin()) or (select platform.has_grant(app_slug)));

-- Creates (p_id null) or replaces a set with its apps in the given order.
create function platform.admin_save_set(
  p_id uuid, p_name text, p_description text, p_position integer, p_apps text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform platform.require_recent_admin();
  if p_id is null then
    insert into platform.app_sets (name, description, position)
    values (p_name, p_description, coalesce(p_position, 100))
    returning id into v_id;
  else
    update platform.app_sets
    set name = p_name, description = p_description, position = coalesce(p_position, 100)
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'unknown set' using errcode = 'P0002';
    end if;
    delete from platform.app_set_items where set_id = v_id;
  end if;
  insert into platform.app_set_items (set_id, app_slug, position)
  select v_id, a.slug, s.ord::integer
  from unnest(coalesce(p_apps, '{}')) with ordinality s(slug, ord)
  join platform.apps a on a.slug = s.slug;
  insert into platform.audit_log (actor_id, action, detail)
  values ((select auth.uid()), 'app_set.saved', jsonb_build_object('set', v_id, 'apps', p_apps));
  return v_id;
end;
$$;

create function platform.admin_delete_set(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.require_recent_admin();
  delete from platform.app_sets where id = p_id;
  if not found then
    raise exception 'unknown set' using errcode = 'P0002';
  end if;
  insert into platform.audit_log (actor_id, action, detail)
  values ((select auth.uid()), 'app_set.deleted', jsonb_build_object('set', p_id));
end;
$$;

revoke execute on function
  platform.admin_set_app_category(text, text),
  platform.admin_delete_category(text),
  platform.admin_set_whitelist(text, boolean, uuid[]),
  platform.admin_save_link(text, text, text, text, boolean),
  platform.admin_delete_link(text),
  platform.record_app_open(text),
  platform.admin_save_set(uuid, text, text, integer, text[]),
  platform.admin_delete_set(uuid)
  from public, anon;
grant execute on function
  platform.admin_set_app_category(text, text),
  platform.admin_delete_category(text),
  platform.admin_set_whitelist(text, boolean, uuid[]),
  platform.admin_save_link(text, text, text, text, boolean),
  platform.admin_delete_link(text),
  platform.record_app_open(text),
  platform.admin_save_set(uuid, text, text, integer, text[]),
  platform.admin_delete_set(uuid)
  to authenticated;

-- ---------- the first link tile ----------
insert into platform.apps
  (slug, name, description, kind, target, link_url, manifest, status, is_default)
values ('att', 'ATT - Werkzeugkasten', 'Sammlung praktischer Online-Werkzeuge (All The Tools)',
  'link', 'external', 'https://att-allthetools.com', '{}', 'online', true)
on conflict (slug) do nothing;
insert into platform.app_grants (user_id, app_slug)
select user_id, 'att' from platform.profiles
where exists (select 1 from platform.apps where slug = 'att' and kind = 'link')
on conflict do nothing;
