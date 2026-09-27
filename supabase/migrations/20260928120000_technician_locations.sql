-- ── Technician locations ──────────────────────────────────────────────────────
-- Where technicians are, so the office can send the closest one.
-- POPIA: a location is personal information, so
--   * it's off until the company's master account switches it on
--     (Company Details → Technician locations), and the app tells each
--     technician when their location is being shared;
--   * the app only shares it while the technician is clocked in on a job;
--   * only the master account and admins see positions (each person can see
--     their own);
--   * positions are deleted after 30 days.
-- Plan feature: tech_location (Pro and Enterprise).

alter table public.team_profiles add column if not exists share_location boolean not null default false;

create table if not exists public.tech_locations (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  lat numeric(9,6) not null check (lat between -90 and 90),
  lng numeric(9,6) not null check (lng between -180 and 180),
  accuracy_m integer check (accuracy_m between 0 and 100000),
  job_id uuid references public.jobs(id) on delete set null,
  recorded_at timestamptz not null default now()
);
create index if not exists tech_locations_team_time_idx on public.tech_locations (team_id, recorded_at desc);
create index if not exists tech_locations_user_time_idx on public.tech_locations (user_id, recorded_at desc);

create or replace function private.location_sharing_on(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select share_location from public.team_profiles where team_id = p_team_id), false)
     and private.team_has_feature(p_team_id, 'tech_location');
$$;
revoke execute on function private.location_sharing_on(uuid) from public, anon;
grant execute on function private.location_sharing_on(uuid) to authenticated;

alter table public.tech_locations enable row level security;
drop policy if exists tech_locations_select on public.tech_locations;
drop policy if exists tech_locations_insert on public.tech_locations;
drop policy if exists tech_locations_plan_insert on public.tech_locations;
create policy tech_locations_select on public.tech_locations for select to authenticated
  using (private.same_team(team_id) and (user_id = auth.uid() or private.is_team_manager(team_id)));
create policy tech_locations_insert on public.tech_locations for insert to authenticated
  with check (private.same_team(team_id) and user_id = auth.uid() and private.location_sharing_on(team_id)
              and recorded_at > now() - interval '1 hour' and recorded_at < now() + interval '5 minutes');
create policy tech_locations_plan_insert on public.tech_locations as restrictive for insert to authenticated
  with check (private.team_access(team_id) = 'full');
revoke all on public.tech_locations from anon;
revoke update, delete on public.tech_locations from authenticated;
grant select, insert on public.tech_locations to authenticated;

-- The latest position of each person in the last 12 hours (managers only).
create or replace function private.latest_tech_locations(p_team_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.same_team(p_team_id) and private.is_team_manager(p_team_id)) then
    raise exception 'Only the master account or an admin can see where technicians are';
  end if;
  return coalesce((
    select jsonb_agg(row_to_json(x) order by x.recorded_at desc) from (
      select distinct on (l.user_id) l.user_id, l.lat, l.lng, l.accuracy_m, l.job_id, l.recorded_at,
             j.job_number, j.title as job_title, j.location as job_location
        from public.tech_locations l
        left join public.jobs j on j.id = l.job_id
       where l.team_id = p_team_id and l.recorded_at > now() - interval '12 hours'
       order by l.user_id, l.recorded_at desc) x), '[]'::jsonb);
end $$;
revoke execute on function private.latest_tech_locations(uuid) from public, anon;
grant execute on function private.latest_tech_locations(uuid) to authenticated;
create or replace function public.latest_tech_locations(p_team_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.latest_tech_locations(p_team_id); $$;
revoke execute on function public.latest_tech_locations(uuid) from public, anon;
grant execute on function public.latest_tech_locations(uuid) to authenticated;

-- Is sharing on for my company? (The app asks before it starts tracking.)
create or replace function public.location_sharing_on(p_team_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.same_team(p_team_id) and private.location_sharing_on(p_team_id);
$$;
revoke execute on function public.location_sharing_on(uuid) from public, anon;
grant execute on function public.location_sharing_on(uuid) to authenticated;

-- Positions older than 30 days are deleted every night (01:15 UTC).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-location-purge') then
    perform cron.unschedule('powermate-location-purge');
  end if;
  perform cron.schedule('powermate-location-purge', '15 1 * * *',
    $cmd$ delete from public.tech_locations where recorded_at < now() - interval '30 days' $cmd$);
end $$;

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['tech_locations','form_submissions','form_templates','customer_messages','purchase_orders','suppliers',
               'reminder_log','client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment','quotes',
               'contacts','expenses','vehicle_checks','custom_faults','company_documents','machine_jack_confirmations',
               'team_notifications','billing_payments','clients']::text[];
$$;
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''tech_locations''' in d) = 0 then
    d := replace(d, '''form_submissions''];', '''form_submissions'',''tech_locations''];');
    if position('''tech_locations''' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
