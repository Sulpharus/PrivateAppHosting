-- Pictures uploaded from the device: the path of the (resized) JPEG in mn.files, shared scope, so
-- the people who see the list can load it. image_url (a link) stays for older wishes and for people
-- who prefer a link; a wish shows image_path first.
alter table app_wunschliste.wishes
  add column image_path text
  check (image_path ~ '^wishes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$');
grant update (image_path) on app_wunschliste.wishes to authenticated;

-- wishlist() returns the path as well (a new column, so the function is replaced).
drop function app_wunschliste.wishlist(uuid);
create function app_wunschliste.wishlist(p_owner uuid)
returns table (
  id uuid, title text, note text, url text, image_url text, price_cents integer,
  priority smallint, created_at timestamptz, status text, image_path text
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
    w.image_path
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
revoke execute on function app_wunschliste.wishlist(uuid) from public, anon;
grant execute on function app_wunschliste.wishlist(uuid) to authenticated;
