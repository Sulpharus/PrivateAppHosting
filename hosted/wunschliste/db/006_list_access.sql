-- Who may see a wishlist: everyone with the app (public, the default) or only the people the
-- owner put on the list's whitelist. people(), wishlist() and reserve() ask can_see(); the owner
-- always sees their own list. Additive: without a settings row a list stays public.

create table app_wunschliste.list_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique references auth.users (id) on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'whitelist')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger list_settings_touch before update on app_wunschliste.list_settings
  for each row execute function platform.touch_updated_at();
select platform.secure_table('wunschliste', 'list_settings', 'private');

-- The whitelist: one row per person who may see the owner's list.
create table app_wunschliste.list_viewers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  viewer_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_id),
  check (viewer_id <> owner_id)
);
create index list_viewers_viewer_id_idx on app_wunschliste.list_viewers (viewer_id);
select platform.secure_table('wunschliste', 'list_viewers', 'private');
-- A whitelist row only says who may look; it is never edited, only added or removed.
revoke update on app_wunschliste.list_viewers from authenticated;

-- Whether the caller may see p_owner's list. Only for the functions below (they run as the
-- owner of the schema): callers cannot ask it, so nobody can probe who keeps a whitelist.
create function app_wunschliste.can_see(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = (select auth.uid())
    or coalesce(
      (select s.visibility from app_wunschliste.list_settings s where s.owner_id = p_owner),
      'public'
    ) = 'public'
    or exists (
      select 1 from app_wunschliste.list_viewers v
      where v.owner_id = p_owner and v.viewer_id = (select auth.uid())
    );
$$;
revoke execute on function app_wunschliste.can_see(uuid) from public, anon, authenticated;

-- people(): only lists the caller may see.
create or replace function app_wunschliste.people()
returns table (user_id uuid, display_name text, wishes bigint, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  -- The owners the caller may see, asked once per owner (not per wish).
  with visible as (
    select distinct w.owner_id
    from app_wunschliste.wishes w
    where app_wunschliste.can_see(w.owner_id)
  )
  select w.owner_id, p.display_name, count(*), w.owner_id = (select auth.uid())
  from app_wunschliste.wishes w
  join visible v on v.owner_id = w.owner_id
  join platform.profiles p on p.user_id = w.owner_id
  left join app_wunschliste.reservations r on r.wish_id = w.id
  where (select platform.app_access('wunschliste'))
    -- Counted like wishlist() shows them (given wishes vanish for others after 30 days).
    and (
      w.owner_id = (select auth.uid())
      or r.id is null
      or r.owner_id = (select auth.uid())
      or r.reserved_at > now() - interval '30 days'
    )
  group by w.owner_id, p.display_name
  order by w.owner_id = (select auth.uid()) desc, p.display_name;
$$;

-- wishlist(): no rows for a list the caller may not see (as if it were empty).
create or replace function app_wunschliste.wishlist(p_owner uuid)
returns table (
  id uuid, title text, note text, url text, image_url text, price_cents integer,
  priority smallint, created_at timestamptz, status text, image_path text, category text
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.title, w.note, w.url, w.image_url, w.price_cents, w.priority, w.created_at,
    case
      when r.id is null then 'frei'
      when r.owner_id = (select auth.uid()) then 'von-dir'
      else 'geschenkt'
    end,
    w.image_path,
    w.category
  from app_wunschliste.wishes w
  left join app_wunschliste.reservations r on r.wish_id = w.id
  where (select platform.app_access('wunschliste'))
    and w.owner_id = p_owner
    and p_owner is distinct from (select auth.uid())
    and app_wunschliste.can_see(p_owner)
    and (
      r.id is null
      or r.owner_id = (select auth.uid())
      or r.reserved_at > now() - interval '30 days'
    )
  order by w.priority, w.created_at desc;
$$;

-- reserve(): a wish of a list the caller may not see does not exist for them.
create or replace function app_wunschliste.reserve(p_wish uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wish app_wunschliste.wishes;
  v_name text;
  v_id uuid;
begin
  if (select auth.uid()) is null or not (select platform.app_access('wunschliste')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Own wishes are refused before locking, so the owner never waits on someone's reservation.
  if exists (
    select 1 from app_wunschliste.wishes where id = p_wish and owner_id = (select auth.uid())
  ) then
    raise exception 'own_wish' using errcode = '42501';
  end if;
  -- Access first, without a lock: someone who may not see the list never holds its rows.
  if not exists (
    select 1 from app_wunschliste.wishes w where w.id = p_wish and app_wunschliste.can_see(w.owner_id)
  ) then
    raise exception 'wish_not_found' using errcode = 'P0002';
  end if;
  select * into v_wish from app_wunschliste.wishes where id = p_wish for update;
  if not found then
    raise exception 'wish_not_found' using errcode = 'P0002';
  end if;
  select display_name into v_name from platform.profiles where user_id = v_wish.owner_id;
  insert into app_wunschliste.reservations
    (owner_id, wish_id, recipient_id, recipient_name, title, url, image_url, price_cents)
  values ((select auth.uid()), v_wish.id, v_wish.owner_id, coalesce(v_name, 'Unbekannt'),
    v_wish.title, v_wish.url, v_wish.image_url, v_wish.price_cents)
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'already_reserved' using errcode = '23505';
end;
$$;

-- Find someone for the whitelist by their exact e-mail address: their id and name, only among
-- the people who may use the app (app_people leaves the caller out). Nobody's address is ever
-- returned, so the search cannot list addresses; names are searched in the browser over
-- mn.people(). Trade-off, accepted for an invite-only group: someone who already knows an
-- address learns whether its owner uses the app, and under which name.
create function app_wunschliste.find_person(p_email text)
returns table (user_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.display_name
  from platform.app_people('wunschliste') a
  join auth.users u on u.id = a.user_id
  where (select platform.app_access('wunschliste'))
    and char_length(p_email) between 3 and 320
    and lower(u.email) = lower(btrim(p_email));
$$;
revoke execute on function app_wunschliste.find_person(text) from public, anon;
grant execute on function app_wunschliste.find_person(text) to authenticated;

notify pgrst, 'reload schema';
