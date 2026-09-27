-- ── Service plans (planned maintenance) ───────────────────────────────────────
-- A company agrees to service a client's machine every so often. The plan
-- makes the job by itself a set number of days before each service is due,
-- assigns it, tells the technician, moves the machine's next service date on,
-- and schedules the next one. The master account and admins manage plans;
-- everyone in the company can see them.
create table if not exists public.service_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  client_id uuid references public.clients(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete set null,
  title text not null check (length(title) between 1 and 200),
  description text check (length(description) <= 4000),
  location text check (length(location) <= 300),
  every_months int check (every_months between 1 and 60),
  every_days int check (every_days between 1 and 730),
  next_due date not null,
  lead_days int not null default 7 check (lead_days between 0 and 90),
  assigned_to_user_id uuid references auth.users(id) on delete set null,
  value numeric(12,2) not null default 0 check (value >= 0),
  active boolean not null default true,
  ends_on date,
  last_job_id uuid,
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_plans_interval check ((every_months is null) <> (every_days is null))
);
create index if not exists service_plans_due_idx on public.service_plans (next_due) where active;
create index if not exists service_plans_team_idx on public.service_plans (team_id);

alter table public.jobs add column if not exists service_plan_id uuid references public.service_plans(id) on delete set null;
create unique index if not exists jobs_service_plan_due_uidx on public.jobs (service_plan_id, scheduled_date) where service_plan_id is not null;

drop trigger if exists service_plans_updated_at on public.service_plans;
create trigger service_plans_updated_at before update on public.service_plans
  for each row execute function public.set_updated_at();

alter table public.service_plans enable row level security;
drop policy if exists service_plans_select on public.service_plans;
drop policy if exists service_plans_insert on public.service_plans;
drop policy if exists service_plans_update on public.service_plans;
drop policy if exists service_plans_delete on public.service_plans;
create policy service_plans_select on public.service_plans for select to authenticated using (private.same_team(team_id));
create policy service_plans_insert on public.service_plans for insert to authenticated
  with check (private.same_team(team_id) and private.is_team_manager(team_id)
              and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.team_id = service_plans.team_id))
              and (equipment_id is null or exists (select 1 from public.equipment e where e.id = equipment_id and e.team_id = service_plans.team_id)));
create policy service_plans_update on public.service_plans for update to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id))
  with check (private.same_team(team_id) and private.is_team_manager(team_id)
              and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.team_id = service_plans.team_id))
              and (equipment_id is null or exists (select 1 from public.equipment e where e.id = equipment_id and e.team_id = service_plans.team_id)));
create policy service_plans_delete on public.service_plans for delete to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id));
revoke all on public.service_plans from anon;
grant select, insert, update, delete on public.service_plans to authenticated;

drop policy if exists service_plans_plan_read on public.service_plans;
drop policy if exists service_plans_plan_insert on public.service_plans;
drop policy if exists service_plans_plan_update on public.service_plans;
drop policy if exists service_plans_plan_delete on public.service_plans;
create policy service_plans_plan_read on public.service_plans as restrictive for select to authenticated
  using (private.team_access(team_id) <> 'suspended');
create policy service_plans_plan_insert on public.service_plans as restrictive for insert to authenticated
  with check (private.team_access(team_id) = 'full');
create policy service_plans_plan_update on public.service_plans as restrictive for update to authenticated
  using (private.team_access(team_id) = 'full') with check (private.team_access(team_id) = 'full');
create policy service_plans_plan_delete on public.service_plans as restrictive for delete to authenticated
  using (private.team_access(team_id) = 'full');

drop trigger if exists audit_service_plans on public.service_plans;
create trigger audit_service_plans after insert or update or delete on public.service_plans
  for each row execute function private.audit_row();

-- The due date after d for a plan.
create or replace function private.service_plan_next(p public.service_plans, d date) returns date
language sql immutable set search_path = '' as $$
  select case when p.every_months is not null then (d + make_interval(months => p.every_months))::date
              else d + p.every_days end;
$$;

-- Makes the job for one plan's next service and moves the plan on. If several
-- services were missed (e.g. the plan was paused), only the latest one gets a
-- job, so switching a plan back on never floods the job list.
create or replace function private.make_service_job(p_plan_id uuid, p_force boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.service_plans;
  v_due date;
  v_job uuid;
  v_client text;
begin
  select * into p from public.service_plans where id = p_plan_id for update;
  if not found or not p.active then return null; end if;
  if private.team_access(p.team_id) <> 'full' then return null; end if;
  v_due := p.next_due;
  while private.service_plan_next(p, v_due) <= current_date loop
    v_due := private.service_plan_next(p, v_due);
  end loop;
  if p.ends_on is not null and v_due > p.ends_on then
    update public.service_plans set active = false, next_due = v_due where id = p.id;
    return null;
  end if;
  if not p_force and v_due - p.lead_days > current_date then return null; end if;
  select company into v_client from public.clients where id = p.client_id;
  insert into public.jobs (user_id, team_id, client_id, service_plan_id, job_number, title, description, status, priority,
                           scheduled_date, location, assigned_to_user_id, parts_used, photos, sync_status)
  values (p.user_id, p.team_id, p.client_id, p.id,
          'SVC-' || to_char(v_due, 'YYMMDD') || '-' || upper(left(replace(p.id::text, '-', ''), 4)),
          p.title, coalesce(p.description, 'Planned service'), 'scheduled', 'normal', v_due,
          coalesce(p.location, ''), p.assigned_to_user_id, '[]'::jsonb, '[]'::jsonb, 'synced')
  on conflict (service_plan_id, scheduled_date) where service_plan_id is not null do nothing
  returning id into v_job;
  update public.service_plans
     set next_due = private.service_plan_next(p, v_due), last_job_id = coalesce(v_job, last_job_id), last_generated_at = now()
   where id = p.id;
  if p.equipment_id is not null then
    update public.equipment set service_due = v_due, updated_at = now() where id = p.equipment_id and team_id = p.team_id;
  end if;
  if v_job is not null and p.assigned_to_user_id is not null then
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
    values (p.team_id, p.user_id, p.assigned_to_user_id, 'job', v_job, coalesce(v_client, p.title),
            format('Planned service on %s: %s', to_char(v_due, 'DD Mon YYYY'), p.title));
  end if;
  return v_job;
end $$;
revoke execute on function private.make_service_job(uuid, boolean) from public, anon, authenticated;

-- Daily run (pg_cron): every plan whose next service is within its lead time.
create or replace function private.generate_service_jobs() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from public.service_plans where active and next_due - lead_days <= current_date loop
    begin
      if private.make_service_job(r.id) is not null then n := n + 1; end if;
    exception when others then
      insert into public.events (user_id, name, data, "timestamp")
      select sp.user_id, 'service_plan_failed', jsonb_build_object('plan_id', r.id, 'error', sqlerrm), now()
        from public.service_plans sp where sp.id = r.id;
    end;
  end loop;
  return n;
end $$;
revoke execute on function private.generate_service_jobs() from public, anon, authenticated;

-- "Make the job now" from the app.
create or replace function private.create_service_job_now(p_plan_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.service_plans where id = p_plan_id;
  if v_team is null or not private.same_team(v_team) or not private.is_team_manager(v_team) then
    raise exception 'Only the master account or an admin can do this';
  end if;
  if private.team_access(v_team) <> 'full' then raise exception 'Your account is read-only'; end if;
  return private.make_service_job(p_plan_id, true);
end $$;
revoke execute on function private.create_service_job_now(uuid) from public, anon;
grant execute on function private.create_service_job_now(uuid) to authenticated;
create or replace function public.create_service_job_now(p_plan_id uuid) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_service_job_now(p_plan_id); $$;
revoke execute on function public.create_service_job_now(uuid) from public, anon;
grant execute on function public.create_service_job_now(uuid) to authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-service-plans') then
    perform cron.unschedule('powermate-service-plans');
  end if;
  -- 04:10 UTC = 06:10 in South Africa.
  perform cron.schedule('powermate-service-plans', '10 4 * * *', 'select private.generate_service_jobs();');
end $$;

-- ── Company export / deletion ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['stock_movements','products','time_entries','payments','invoices','jobs','service_plans','repair_reports',
               'breakdown_reports','followups','notes','activities','leads','equipment','quotes','contacts','expenses',
               'vehicle_checks','custom_faults','company_documents','machine_jack_confirmations','team_notifications',
               'clients']::text[];
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''service_plans''' in d) = 0 then
    d := replace(d, '''time_entries''];', '''time_entries'',''service_plans''];');
    execute d;
  end if;
end $$;
