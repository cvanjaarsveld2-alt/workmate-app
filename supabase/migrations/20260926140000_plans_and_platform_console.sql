-- ── Plans, trials, suspension and the platform console ───────────────────────
-- team_plans: one row per company. Companies can read their own; only
-- platform admins change it (through admin_update_plan).
--   access "full"      : trial running, or an active paid/free plan
--   access "read_only" : trial ended, or status past_due — the company can see
--                        and export its data but not add or change anything
--   access "suspended" : status suspended/cancelled — no access to its data
-- Enforced by restrictive policies on every company table, so it holds even
-- for an old copy of the app.
create table if not exists public.team_plans (
  team_id uuid primary key references public.teams(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'enterprise', 'free')),
  status text not null default 'active' check (status in ('active', 'past_due', 'suspended', 'cancelled')),
  trial_ends_at timestamptz default (now() + interval '14 days'),
  paid_until date,
  seats int check (seats is null or seats between 1 and 10000),
  notes text check (length(notes) <= 2000),
  updated_at timestamptz not null default now()
);
alter table public.team_plans enable row level security;
drop policy if exists team_plans_select on public.team_plans;
create policy team_plans_select on public.team_plans for select to authenticated
  using ((select private.same_team(team_id)) or (select private.is_platform_admin()));
grant select on public.team_plans to authenticated;

-- Existing companies keep working as today.
insert into public.team_plans (team_id, plan, status, trial_ends_at)
select id, 'free', 'active', null from public.teams
on conflict (team_id) do nothing;

create or replace function private.create_team_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_plans (team_id) values (new.id) on conflict (team_id) do nothing;
  return new;
end $$;
drop trigger if exists teams_create_plan on public.teams;
create trigger teams_create_plan after insert on public.teams
  for each row execute function private.create_team_plan();

create or replace function private.team_access(p_team_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_team_id is null then 'full'
    when tp.team_id is null then 'full'
    when tp.status in ('suspended', 'cancelled') then 'suspended'
    when tp.status = 'past_due' then 'read_only'
    when tp.plan = 'trial' and tp.trial_ends_at is not null and tp.trial_ends_at < now() then 'read_only'
    else 'full' end
  from (select p_team_id as id) x left join public.team_plans tp on tp.team_id = x.id;
$$;
revoke execute on function private.team_access(uuid) from public, anon;
grant execute on function private.team_access(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['activities','breakdown_reports','clients','company_documents','contacts','custom_faults',
    'equipment','expenses','followups','invoices','jobs','leads','machine_jack_confirmations','notes','payments',
    'quotes','repair_reports','team_notifications','team_profiles','vehicle_checks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_plan_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_delete', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated
      using (team_id is null or private.team_access(team_id) <> ''suspended'')', t || '_plan_read', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (team_id is null or private.team_access(team_id) = ''full'')', t || '_plan_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated
      using (team_id is null or private.team_access(team_id) = ''full'')
      with check (team_id is null or private.team_access(team_id) = ''full'')', t || '_plan_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated
      using (team_id is null or private.team_access(team_id) = ''full'')', t || '_plan_delete', t);
  end loop;
end $$;

-- The company's own view of its plan (for banners in the app).
create or replace function private.my_team_plan() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('plan', tp.plan, 'status', tp.status, 'trial_ends_at', tp.trial_ends_at,
                            'paid_until', tp.paid_until, 'access', private.team_access(tm.team_id))
    from public.team_members tm left join public.team_plans tp on tp.team_id = tm.team_id
   where tm.user_id = auth.uid() order by tm.joined_at limit 1;
$$;
revoke execute on function private.my_team_plan() from public, anon;
grant execute on function private.my_team_plan() to authenticated;
create or replace function public.my_team_plan() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.my_team_plan(); $$;
revoke execute on function public.my_team_plan() from public, anon;
grant execute on function public.my_team_plan() to authenticated;

-- ── Platform console ─────────────────────────────────────────────────────────
create or replace function private.admin_list_companies() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(c) order by c.created_at desc) from (
      select t.id, t.name, t.created_at,
             (select u.email from auth.users u where u.id = t.owner_user_id) as owner_email,
             (select count(*) from public.team_members m where m.team_id = t.id) as members,
             (select max(e."timestamp") from public.events e join public.team_members m on m.user_id = e.user_id where m.team_id = t.id) as last_active,
             (select count(*) from public.clients x where x.team_id = t.id) as clients,
             (select count(*) from public.quotes x where x.team_id = t.id) as quotes,
             (select count(*) from public.invoices x where x.team_id = t.id) as invoices,
             tp.plan, tp.status, tp.trial_ends_at, tp.paid_until, tp.seats, tp.notes,
             private.team_access(t.id) as access
        from public.teams t left join public.team_plans tp on tp.team_id = t.id) c), '[]'::jsonb);
end $$;

create or replace function private.admin_update_plan(p_team_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  insert into public.team_plans (team_id) values (p_team_id) on conflict (team_id) do nothing;
  update public.team_plans set
    plan = coalesce(p_patch ->> 'plan', plan),
    status = coalesce(p_patch ->> 'status', status),
    trial_ends_at = case when p_patch ? 'trial_ends_at' then (p_patch ->> 'trial_ends_at')::timestamptz else trial_ends_at end,
    paid_until = case when p_patch ? 'paid_until' then (p_patch ->> 'paid_until')::date else paid_until end,
    seats = case when p_patch ? 'seats' then (p_patch ->> 'seats')::int else seats end,
    notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else notes end,
    updated_at = now()
  where team_id = p_team_id;
  insert into public.events (user_id, name, data, "timestamp")
  values (auth.uid(), 'plan_changed', jsonb_build_object('team_id', p_team_id, 'patch', p_patch), now());
end $$;

revoke execute on function private.admin_list_companies() from public, anon;
revoke execute on function private.admin_update_plan(uuid, jsonb) from public, anon;
grant execute on function private.admin_list_companies() to authenticated;
grant execute on function private.admin_update_plan(uuid, jsonb) to authenticated;
create or replace function public.admin_list_companies() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.admin_list_companies(); $$;
create or replace function public.admin_update_plan(p_team_id uuid, p_patch jsonb) returns void
language sql security invoker set search_path = '' as $$ select private.admin_update_plan(p_team_id, p_patch); $$;
revoke execute on function public.admin_list_companies() from public, anon;
revoke execute on function public.admin_update_plan(uuid, jsonb) from public, anon;
grant execute on function public.admin_list_companies() to authenticated;
grant execute on function public.admin_update_plan(uuid, jsonb) to authenticated;
