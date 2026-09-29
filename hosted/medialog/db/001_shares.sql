-- Medialog: works and lists shared with other users of the app. A share is a snapshot the owner
-- writes (private table); recipients read it through shared_with_me(), which checks
-- app_access. The sender is the row's owner_id, never a name inside the payload, so nobody can
-- pose as someone else.

select platform.create_app_schema('medialog');

create table app_medialog.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  kind text not null check (kind in ('work', 'list')),
  item_id text not null check (char_length(item_id) between 1 and 200),
  recipients uuid[] not null check (cardinality(recipients) between 1 and 200),
  payload jsonb not null check (octet_length(payload::text) <= 500000),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, item_id)
);
-- The owner reads and writes their own shares (policy from secure_table).
select platform.secure_table('medialog', 'shares', 'private');

create index shares_recipients_idx on app_medialog.shares using gin (recipients);

-- What others shared with the caller, with the sender's display name from their profile.
create function app_medialog.shared_with_me()
returns table (
  id uuid, owner_id uuid, owner_name text, kind text, item_id text, payload jsonb,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.owner_id, coalesce(p.display_name, 'Jemand'), s.kind, s.item_id, s.payload,
    s.updated_at
  from app_medialog.shares s
  left join platform.profiles p on p.user_id = s.owner_id
  where (select platform.app_access('medialog'))
    and (select auth.uid()) = any (s.recipients)
    and s.owner_id <> (select auth.uid())
  order by s.updated_at desc;
$$;
revoke execute on function app_medialog.shared_with_me() from public, anon;
grant execute on function app_medialog.shared_with_me() to authenticated;

create function app_medialog.touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger shares_touch before update on app_medialog.shares
  for each row execute function app_medialog.touch();
