-- AI proxy budgets. Amounts are integers in micro-euros (1 € = 1_000_000) to stay exact.
-- The proxy (service role) reserves the worst-case cost before calling a model and settles
-- the real cost afterwards, so concurrent streams can never overspend a budget.

create table platform.ai_budgets (
  scope text not null check (scope in ('global', 'role', 'app', 'user')),
  scope_key text not null,
  monthly_limit_micro bigint not null check (monthly_limit_micro >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, scope_key)
);

create table platform.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug) on delete cascade on update cascade,
  model text not null,
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  reserved_micro bigint not null check (reserved_micro >= 0),
  cost_micro bigint check (cost_micro >= 0),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index ai_usage_user_month_idx on platform.ai_usage (user_id, created_at);
create index ai_usage_app_month_idx on platform.ai_usage (app_slug, created_at);
create index ai_usage_open_idx on platform.ai_usage (created_at) where status = 'reserved';

insert into platform.ai_budgets (scope, scope_key, monthly_limit_micro) values
  ('global', '*', 25000000),
  ('role', 'user', 2000000),
  ('role', 'trusted', 5000000);

alter table platform.ai_budgets enable row level security;
alter table platform.ai_usage enable row level security;
grant select on platform.ai_budgets, platform.ai_usage to authenticated;
grant insert, update, delete on platform.ai_budgets to authenticated;
grant all on platform.ai_budgets, platform.ai_usage to service_role;

create policy ai_budgets_admin_all on platform.ai_budgets for all to authenticated
  using ((select platform.is_admin()))
  with check ((select platform.is_admin()) and (select platform.recent_auth(600)));
create policy ai_usage_select on platform.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or (select platform.is_admin()));

-- Spend (settled cost + open reservations) since the start of the current month.
create function platform.ai_spent_micro(p_scope text, p_key text) returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when u.status = 'settled' then u.cost_micro else u.reserved_micro end), 0)::bigint
  from platform.ai_usage u
  left join platform.profiles p on p.user_id = u.user_id
  where u.status in ('settled', 'reserved')
    and u.created_at >= date_trunc('month', now())
    and case p_scope
      when 'global' then true
      when 'role' then p.role::text = p_key
      when 'app' then u.app_slug = p_key
      when 'user' then u.user_id::text = p_key
    end;
$$;
revoke execute on function platform.ai_spent_micro(text, text) from public, anon, authenticated;

-- Reserves `p_max_micro` for one call or raises `budget_exceeded:<scope>`.
-- Limits checked: user override (else role default), app, global. The admin skips all but
-- explicit user overrides.
create function platform.ai_reserve(p_user_id uuid, p_app_slug text, p_model text, p_max_micro bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role platform.user_role;
  v_limit bigint;
  v_id uuid;
begin
  if p_max_micro <= 0 then
    raise exception 'reservation must be positive' using errcode = '22023';
  end if;

  -- Serialize reservations; volume is tiny, correctness matters more than parallelism.
  perform pg_advisory_xact_lock(hashtext('platform.ai_reserve'));

  select role into v_role from platform.profiles where user_id = p_user_id;
  if v_role is null then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;

  -- per user: explicit override, otherwise the role default (admin: unlimited unless overridden)
  select monthly_limit_micro into v_limit from platform.ai_budgets
    where scope = 'user' and scope_key = p_user_id::text;
  if v_limit is null and v_role <> 'admin' then
    select monthly_limit_micro into v_limit from platform.ai_budgets
      where scope = 'role' and scope_key = v_role::text;
  end if;
  if v_limit is not null
    and platform.ai_spent_micro('user', p_user_id::text) + p_max_micro > v_limit then
    raise exception 'budget_exceeded:user' using errcode = 'P0001';
  end if;

  if v_role <> 'admin' then
    select monthly_limit_micro into v_limit from platform.ai_budgets
      where scope = 'app' and scope_key = p_app_slug;
    if v_limit is not null and platform.ai_spent_micro('app', p_app_slug) + p_max_micro > v_limit then
      raise exception 'budget_exceeded:app' using errcode = 'P0001';
    end if;

    select monthly_limit_micro into v_limit from platform.ai_budgets
      where scope = 'global' and scope_key = '*';
    if v_limit is not null and platform.ai_spent_micro('global', '*') + p_max_micro > v_limit then
      raise exception 'budget_exceeded:global' using errcode = 'P0001';
    end if;
  end if;

  insert into platform.ai_usage (user_id, app_slug, model, reserved_micro)
  values (p_user_id, p_app_slug, p_model, p_max_micro)
  returning id into v_id;
  return v_id;
end;
$$;

-- Settles a reservation with the real cost (or releases it when the call failed).
create function platform.ai_settle(
  p_usage_id uuid,
  p_cost_micro bigint,
  p_input_tokens integer default null,
  p_output_tokens integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update platform.ai_usage
  set status = case when p_cost_micro is null then 'released' else 'settled' end,
      cost_micro = p_cost_micro,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      settled_at = now()
  where id = p_usage_id and status = 'reserved';
  if not found then
    raise exception 'reservation % is not open', p_usage_id using errcode = 'P0002';
  end if;
end;
$$;

-- Releases reservations whose settle call never arrived (e.g. a crashed request).
create function platform.ai_release_stale(p_older_than interval default interval '15 minutes')
returns integer
language sql
security definer
set search_path = ''
as $$
  with released as (
    update platform.ai_usage
    set status = 'released', settled_at = now()
    where status = 'reserved' and created_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer from released;
$$;

revoke execute on function platform.ai_reserve(uuid, text, text, bigint) from public, anon, authenticated;
revoke execute on function platform.ai_settle(uuid, bigint, integer, integer) from public, anon, authenticated;
revoke execute on function platform.ai_release_stale(interval) from public, anon, authenticated;
grant execute on function platform.ai_reserve(uuid, text, text, bigint) to service_role;
grant execute on function platform.ai_settle(uuid, bigint, integer, integer) to service_role;
grant execute on function platform.ai_release_stale(interval) to service_role;
grant execute on function platform.ai_spent_micro(text, text) to service_role;

-- What the signed-in user has spent this month and their effective limit (for the portal).
create function platform.my_ai_budget()
returns table (spent_micro bigint, limit_micro bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    platform.ai_spent_micro('user', (select auth.uid())::text),
    coalesce(
      (select b.monthly_limit_micro from platform.ai_budgets b
        where b.scope = 'user' and b.scope_key = (select auth.uid())::text),
      (select b.monthly_limit_micro from platform.ai_budgets b
        where b.scope = 'role' and b.scope_key = (select platform.current_user_role())::text)
    );
$$;
revoke execute on function platform.my_ai_budget() from public, anon;
grant execute on function platform.my_ai_budget() to authenticated;
