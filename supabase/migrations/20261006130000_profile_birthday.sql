-- Birthdays (ADR 0025): everyone may enter their birthday in "Dein Konto". Apps (the Wunschliste
-- first) show the birthdays of the people who allowed it, so you know when to give a present.
-- Nothing is shared by default: the birthday is private until `birthday_shared` is switched on,
-- and then only people who can use the same app see it, through `mn.birthdays()`. The year is
-- optional (a person who does not want their age known leaves it out).

alter table platform.profiles
  add column birthday_month smallint check (birthday_month between 1 and 12),
  add column birthday_day smallint check (birthday_day between 1 and 31),
  add column birthday_year smallint check (birthday_year between 1900 and 2100),
  add column birthday_shared boolean not null default false,
  add constraint profiles_birthday_complete check (
    (birthday_month is null) = (birthday_day is null)
    and (birthday_year is null or birthday_month is not null)
    and (birthday_month is null or birthday_day <= case
      when birthday_month in (4, 6, 9, 11) then 30
      when birthday_month = 2 then case
        when birthday_year is null then 29
        when (birthday_year % 4 = 0 and birthday_year % 100 <> 0) or birthday_year % 400 = 0 then 29
        else 28
      end
      else 31
    end)
  );

-- The columns are only written through set_my_birthday (the update grant is per column).
create function platform.my_birthday()
returns table (month smallint, day smallint, year smallint, shared boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.birthday_month, p.birthday_day, p.birthday_year, p.birthday_shared
  from platform.profiles p
  where p.user_id = (select auth.uid());
$$;

-- Sets or clears (month and day null) the caller's birthday.
create function platform.set_my_birthday(p_month integer, p_day integer, p_year integer, p_shared boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update platform.profiles
  set birthday_month = p_month::smallint,
      birthday_day = p_day::smallint,
      birthday_year = case when p_month is null then null else p_year::smallint end,
      birthday_shared = case when p_month is null then false else coalesce(p_shared, false) end
  where user_id = (select auth.uid());
end;
$$;

-- The shared birthdays of the other people who can use this app, from the app's own page.
create function platform.app_birthdays(p_slug text)
returns table (user_id uuid, display_name text, month smallint, day smallint, year smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.birthday_month, p.birthday_day, p.birthday_year
  from platform.app_people(p_slug) a
  join platform.profiles p on p.user_id = a.user_id
  where p.birthday_shared and p.birthday_month is not null
  order by p.birthday_month, p.birthday_day, p.display_name;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['my_birthday()', 'set_my_birthday(integer, integer, integer, boolean)', 'app_birthdays(text)'] loop
    execute format('revoke execute on function platform.%s from public, anon', f);
    execute format('grant execute on function platform.%s to authenticated', f);
  end loop;
end;
$$;
