-- Wunschliste: everyone keeps their own wishlist; everyone else can reserve a wish to give it.
-- Who reserved what is hidden from the list's owner (no spoiled surprises). Both tables are
-- private per user (secure_table); the cross-user views go through the functions below, which
-- check platform.app_access like every policy does.

select platform.create_app_schema('wunschliste');

-- The owner's wishes. Only the owner reads and writes them directly.
create table app_wunschliste.wishes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  note text check (char_length(note) <= 1000),
  url text check (url ~ '^https://' and char_length(url) <= 2000),
  image_url text check (image_url ~ '^https://' and char_length(image_url) <= 2000),
  price_cents integer check (price_cents between 0 and 100000000),
  -- 1 = sehr gern, 2 = normal, 3 = nur eine Idee
  priority smallint not null default 2 check (priority between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select platform.secure_table('wunschliste', 'wishes', 'private');
-- Only the content is editable: changing `id` of a reserved wish would fail on the foreign key
-- and tell the owner it was reserved.
revoke update on app_wunschliste.wishes from authenticated;
grant update (title, note, url, image_url, price_cents, priority) on app_wunschliste.wishes
  to authenticated;

-- A reservation belongs to the giver (owner_id). It keeps a copy of the wish, so the giver's
-- shopping list still shows it after the recipient deleted the wish.
create table app_wunschliste.reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  -- One reservation per wish; deleting the wish keeps the giver's copy.
  wish_id uuid unique references app_wunschliste.wishes (id) on delete set null,
  recipient_id uuid references auth.users (id) on delete set null,
  recipient_name text not null,
  title text not null,
  url text,
  image_url text,
  price_cents integer,
  reserved_at timestamptz not null default now(),
  purchased_at timestamptz
);
create index reservations_recipient_id_idx on app_wunschliste.reservations (recipient_id);
select platform.secure_table('wunschliste', 'reservations', 'private');
-- Reservations are only created by reserve(); the giver may tick one off or cancel it.
revoke insert, update on app_wunschliste.reservations from authenticated;
grant update (purchased_at) on app_wunschliste.reservations to authenticated;

create function app_wunschliste.touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger wishes_touch before update on app_wunschliste.wishes
  for each row execute function app_wunschliste.touch();

-- People with at least one wish, for the start page. `mine` marks the caller.
create function app_wunschliste.people()
returns table (user_id uuid, display_name text, wishes bigint, mine boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select w.owner_id, p.display_name, count(*), w.owner_id = (select auth.uid())
  from app_wunschliste.wishes w
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

-- Someone's wishlist as another user sees it. status: 'frei', 'von-dir' (reserved by the
-- caller) or 'geschenkt' (reserved by someone else; hidden 30 days after the reservation).
-- The owner gets no rows here: they read their own table, which knows nothing of reservations.
create function app_wunschliste.wishlist(p_owner uuid)
returns table (
  id uuid, title text, note text, url text, image_url text, price_cents integer,
  priority smallint, created_at timestamptz, status text
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
    end
  from app_wunschliste.wishes w
  left join app_wunschliste.reservations r on r.wish_id = w.id
  where (select platform.app_access('wunschliste'))
    and w.owner_id = p_owner
    and p_owner is distinct from (select auth.uid())
    and (
      r.id is null
      or r.owner_id = (select auth.uid())
      or r.reserved_at > now() - interval '30 days'
    )
  order by w.priority, w.created_at desc;
$$;

-- Reserve a wish to give it. Fails with 'already_reserved' when someone was faster.
create function app_wunschliste.reserve(p_wish uuid)
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

revoke execute on function app_wunschliste.people() from public, anon;
revoke execute on function app_wunschliste.wishlist(uuid) from public, anon;
revoke execute on function app_wunschliste.reserve(uuid) from public, anon;
revoke execute on function app_wunschliste.touch() from public, anon, authenticated;
grant execute on function app_wunschliste.people() to authenticated;
grant execute on function app_wunschliste.wishlist(uuid) to authenticated;
grant execute on function app_wunschliste.reserve(uuid) to authenticated;
