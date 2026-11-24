-- A category per wish, typed by its owner (e.g. "Küche", "Bücher"), to sort and filter lists by.
-- Nullable, so existing wishes stay as they are.
alter table app_wunschliste.wishes
  add column category text
  check (category = btrim(category) and char_length(category) between 1 and 40);
grant update (category) on app_wunschliste.wishes to authenticated;

-- wishlist() returns the category as well (a new column, so the function is replaced).
drop function app_wunschliste.wishlist(uuid);
create function app_wunschliste.wishlist(p_owner uuid)
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
    and (
      r.id is null
      or r.owner_id = (select auth.uid())
      or r.reserved_at > now() - interval '30 days'
    )
  order by w.priority, w.created_at desc;
$$;
revoke execute on function app_wunschliste.wishlist(uuid) from public, anon;
grant execute on function app_wunschliste.wishlist(uuid) to authenticated;

notify pgrst, 'reload schema';
