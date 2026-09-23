-- Invites pre-create the auth user (generateLink), so "accepted" in the invites table means
-- "account created". An invite counts as pending until that user signs in for the first time.

create function platform.email_registered(p_email text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from auth.users u where lower(u.email) = lower(p_email));
$$;
revoke execute on function platform.email_registered(text) from public, anon, authenticated;
grant execute on function platform.email_registered(text) to service_role;

create function platform.admin_list_invites()
returns table (
  id uuid,
  email text,
  role platform.user_role,
  app_slugs text[],
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select platform.is_admin()) then
    raise exception 'admin required' using errcode = '42501';
  end if;
  return query
    select i.id, i.email, i.role, i.app_slugs,
      case
        when i.revoked_at is not null then 'revoked'
        when u.last_sign_in_at is not null then 'accepted'
        when i.expires_at < now() then 'expired'
        else 'pending'
      end,
      i.expires_at, i.created_at
    from platform.invites i
    left join auth.users u on u.id = i.accepted_by
    order by i.created_at desc;
end;
$$;
revoke execute on function platform.admin_list_invites() from public, anon;
grant execute on function platform.admin_list_invites() to authenticated;
