-- ── What each plan includes ───────────────────────────────────────────────────
-- The platform owner's price list: name, monthly price (rand, incl. VAT if
-- the platform owner is VAT registered), user limit and features per paid
-- plan. Editable in Platform → Plans; these are the starting values.
-- Trial and Free include everything. A company's own "seats" (set in the
-- console) overrides its plan's user limit.
--
-- Features: products (stock), schedule, service_plans, timesheets, reminders
-- (automatic reminders and customer emails), online_payments (PayFast for the
-- company's invoices), xero.
insert into private.platform_settings (key, value, updated_at) values ('plans', '{
  "starter":    {"name": "Starter",    "price": 499,  "seats": 3,    "features": []},
  "pro":        {"name": "Pro",        "price": 1299, "seats": 10,   "features": ["products", "schedule", "service_plans", "timesheets", "reminders", "online_payments"]},
  "enterprise": {"name": "Enterprise", "price": 2999, "seats": null, "features": ["products", "schedule", "service_plans", "timesheets", "reminders", "online_payments", "xero"]}
}'::jsonb, now())
on conflict (key) do nothing;

create or replace function private.all_features() returns text[]
language sql immutable set search_path = '' as $$
  select array['products', 'schedule', 'service_plans', 'timesheets', 'reminders', 'online_payments', 'xero']::text[];
$$;

create or replace function private.plan_catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from private.platform_settings where key = 'plans'), '{}'::jsonb);
$$;

create or replace function private.plan_features(p_team_id uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select case
    when p_team_id is null then private.all_features()
    when tp.team_id is null or tp.plan in ('trial', 'free') then private.all_features()
    else coalesce((select array_agg(f) from jsonb_array_elements_text(private.plan_catalogue() -> tp.plan -> 'features') f), '{}')
  end
  from (select p_team_id as id) x left join public.team_plans tp on tp.team_id = x.id;
$$;

create or replace function private.team_has_feature(p_team_id uuid, p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_team_id is null or p_feature = any(private.plan_features(p_team_id));
$$;

-- User limit: the company's own seats, else its plan's; none for trial/free
-- unless set.
create or replace function private.seat_limit(p_team_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(tp.seats,
                  case when tp.plan in ('trial', 'free') then null
                       else nullif(private.plan_catalogue() -> tp.plan ->> 'seats', '')::int end)
    from public.team_plans tp where tp.team_id = p_team_id;
$$;

revoke execute on function private.plan_catalogue() from public, anon;
revoke execute on function private.plan_features(uuid) from public, anon;
revoke execute on function private.team_has_feature(uuid, text) from public, anon;
revoke execute on function private.seat_limit(uuid) from public, anon;
grant execute on function private.plan_catalogue() to authenticated;
grant execute on function private.plan_features(uuid) to authenticated;
grant execute on function private.team_has_feature(uuid, text) to authenticated;
grant execute on function private.seat_limit(uuid) to authenticated;

-- ── User limit, whichever way someone joins ──
create or replace function private.enforce_seat_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := private.seat_limit(new.team_id);
  v_used int;
begin
  if v_limit is null then return new; end if;
  select count(*) into v_used from public.team_members where team_id = new.team_id;
  if v_used >= v_limit then
    raise exception 'This company''s plan allows % user%. Ask the master account to upgrade in Plan & billing.',
      v_limit, case when v_limit = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function private.enforce_seat_limit() from public, anon, authenticated;
drop trigger if exists team_members_seat_limit on public.team_members;
create trigger team_members_seat_limit before insert on public.team_members
  for each row execute function private.enforce_seat_limit();

-- ── Billing columns (self-service subscriptions, see *_platform_billing) ──
alter table public.team_plans add column if not exists billing_status text check (billing_status in ('active', 'cancelled'));
alter table public.team_plans add column if not exists billing_token text;

-- ── The company's view of its plan ──
create or replace function private.my_team_plan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', tp.plan, 'status', tp.status, 'trial_ends_at', tp.trial_ends_at,
                            'paid_until', tp.paid_until, 'access', private.team_access(tm.team_id),
                            'features', to_jsonb(private.plan_features(tm.team_id)),
                            'seats', private.seat_limit(tm.team_id),
                            'seats_used', (select count(*) from public.team_members m where m.team_id = tm.team_id),
                            'billing_status', tp.billing_status)
    from public.team_members tm left join public.team_plans tp on tp.team_id = tm.team_id
   where tm.user_id = auth.uid() order by tm.joined_at limit 1;
$$;

-- The price list, for the Plan & billing screen.
create or replace function public.plan_catalogue() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.plan_catalogue(); $$;
revoke execute on function public.plan_catalogue() from public, anon;
grant execute on function public.plan_catalogue() to authenticated;

-- Platform owner edits the price list.
create or replace function private.admin_set_plans(p_plans jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k text;
  p jsonb;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  if jsonb_typeof(p_plans) <> 'object' then raise exception 'Expected plans'; end if;
  for k, p in select key, value from jsonb_each(p_plans) loop
    if k not in ('starter', 'pro', 'enterprise') then raise exception 'Unknown plan %', k; end if;
    if coalesce(p ->> 'name', '') = '' or length(p ->> 'name') > 40 then raise exception 'Give the % plan a name', k; end if;
    if not (p ->> 'price' ~ '^[0-9]+(\.[0-9]{1,2})?$') or (p ->> 'price')::numeric > 1000000 then raise exception 'Enter a price for %', p ->> 'name'; end if;
    if p ? 'seats' and p -> 'seats' <> 'null'::jsonb and not (p ->> 'seats' ~ '^[1-9][0-9]{0,4}$') then raise exception 'Users for % must be a number, or empty for unlimited', p ->> 'name'; end if;
    if jsonb_typeof(p -> 'features') <> 'array' or exists (
         select 1 from jsonb_array_elements_text(p -> 'features') f where f <> all(private.all_features())) then
      raise exception 'Unknown feature in %', p ->> 'name';
    end if;
  end loop;
  insert into private.platform_settings (key, value, updated_at) values ('plans', p_plans, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  insert into public.events (user_id, name, data, "timestamp") values (auth.uid(), 'plans_changed', p_plans, now());
end $$;
revoke execute on function private.admin_set_plans(jsonb) from public, anon;
grant execute on function private.admin_set_plans(jsonb) to authenticated;
create or replace function public.admin_set_plans(p_plans jsonb) returns void
language sql security invoker set search_path = '' as $$ select private.admin_set_plans(p_plans); $$;
revoke execute on function public.admin_set_plans(jsonb) from public, anon;
grant execute on function public.admin_set_plans(jsonb) to authenticated;

-- ── Features enforced by the database, not just hidden in the app ──
do $$
declare t text; f text;
begin
  foreach t in array array['products', 'service_plans', 'time_entries'] loop
    f := case t when 'products' then 'products' when 'service_plans' then 'service_plans' else 'timesheets' end;
    execute format('drop policy if exists %I on public.%I', t || '_plan_feature', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (team_id is null or private.team_has_feature(team_id, %L))', t || '_plan_feature', t, f);
  end loop;
end $$;

-- Automatic jobs and connections only for plans that include them.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.daily_reminders()'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'and tp.auto_reminders', 'and tp.auto_reminders and private.team_has_feature(tp.team_id, ''reminders'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.customer_reminder_batch()'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'and tp.email_customer_reminders', 'and tp.email_customer_reminders and private.team_has_feature(tp.team_id, ''reminders'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.generate_service_jobs()'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'where active and next_due - lead_days <= current_date',
                    'where active and next_due - lead_days <= current_date and private.team_has_feature(team_id, ''service_plans'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.portal_can_pay(text)'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'and g.enabled', 'and g.enabled and private.team_has_feature(l.team_id, ''online_payments'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.payfast_checkout_data(text,uuid)'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'where team_id = l.team_id and enabled;', 'where team_id = l.team_id and enabled and private.team_has_feature(l.team_id, ''online_payments'');');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.xero_can_sync(uuid)'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'private.team_access(p_team_id) = ''full''', 'private.team_access(p_team_id) = ''full'' and private.team_has_feature(p_team_id, ''xero'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.xero_connected_teams()'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'private.team_access(x.team_id) = ''full''', 'private.team_access(x.team_id) = ''full'' and private.team_has_feature(x.team_id, ''xero'')');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('private.xero_start(uuid)'::regprocedure);
  if position('team_has_feature' in d) = 0 then
    d := replace(d, 'v_state := encode',
                    'if not private.team_has_feature(p_team_id, ''xero'') then raise exception ''Xero is part of the Enterprise plan''; end if;
  v_state := encode');
    if position('team_has_feature' in d) = 0 then raise exception 'plan feature patch did not apply'; end if;
    execute d;
  end if;
end $$;
