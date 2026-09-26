-- ── Timesheets ────────────────────────────────────────────────────────────────
-- Technicians clock in and out, per job or not, for work or travel. Entries are
-- created on the phone (offline too) and synced like jobs. Each person edits
-- their own time; the master account and admins see everyone's (as with other
-- team records) and can correct them. The company's labour rate (what it
-- charges per hour, excl. VAT) and labour cost (what an hour costs it) turn
-- hours into money on timesheets, job costs and invoices.
alter table public.team_profiles add column if not exists labour_rate numeric(12,2) not null default 0 check (labour_rate >= 0);
alter table public.team_profiles add column if not exists labour_cost numeric(12,2) not null default 0 check (labour_cost >= 0);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  team_id uuid references public.teams(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  client_id uuid,
  kind text not null default 'work' check (kind in ('work', 'travel')),
  started_at timestamptz not null,
  ended_at timestamptz,
  note text check (length(note) <= 500),
  billable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sync_status text,
  sync_pending_job_id uuid,
  constraint time_entries_order check (ended_at is null or ended_at >= started_at),
  constraint time_entries_length check (ended_at is null or ended_at - started_at <= interval '24 hours')
);
create index if not exists time_entries_user_time_idx on public.time_entries (user_id, started_at desc);
create index if not exists time_entries_team_time_idx on public.time_entries (team_id, started_at desc);
create index if not exists time_entries_job_idx on public.time_entries (job_id) where job_id is not null;

drop trigger if exists time_entries_updated_at on public.time_entries;
create trigger time_entries_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;
drop policy if exists time_entries_select on public.time_entries;
drop policy if exists time_entries_insert on public.time_entries;
drop policy if exists time_entries_update on public.time_entries;
drop policy if exists time_entries_delete on public.time_entries;
create policy time_entries_select on public.time_entries for select to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and private.can_see_team(team_id)));
create policy time_entries_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and (team_id is null or private.same_team(team_id)));
create policy time_entries_update on public.time_entries for update to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and private.same_team(team_id) and private.is_team_manager(team_id)))
  with check ((user_id = (select auth.uid()) or (team_id is not null and private.is_team_manager(team_id)))
              and (team_id is null or private.same_team(team_id)));
create policy time_entries_delete on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) or (team_id is not null and private.same_team(team_id) and private.is_team_manager(team_id)));
revoke all on public.time_entries from anon;
grant select, insert, update, delete on public.time_entries to authenticated;

drop policy if exists time_entries_plan_read on public.time_entries;
drop policy if exists time_entries_plan_insert on public.time_entries;
drop policy if exists time_entries_plan_update on public.time_entries;
drop policy if exists time_entries_plan_delete on public.time_entries;
create policy time_entries_plan_read on public.time_entries as restrictive for select to authenticated
  using (team_id is null or private.team_access(team_id) <> 'suspended');
create policy time_entries_plan_insert on public.time_entries as restrictive for insert to authenticated
  with check (team_id is null or private.team_access(team_id) = 'full');
create policy time_entries_plan_update on public.time_entries as restrictive for update to authenticated
  using (team_id is null or private.team_access(team_id) = 'full')
  with check (team_id is null or private.team_access(team_id) = 'full');
create policy time_entries_plan_delete on public.time_entries as restrictive for delete to authenticated
  using (team_id is null or private.team_access(team_id) = 'full');

-- Corrections by someone else show in the activity log; people's own
-- clocking in and out doesn't.
drop trigger if exists audit_time_entries_update on public.time_entries;
drop trigger if exists audit_time_entries_delete on public.time_entries;
create trigger audit_time_entries_update after update on public.time_entries
  for each row when (new.user_id is distinct from auth.uid()) execute function private.audit_row();
create trigger audit_time_entries_delete after delete on public.time_entries
  for each row when (old.user_id is distinct from auth.uid()) execute function private.audit_row();

-- ── Company export / deletion ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['stock_movements','products','time_entries','payments','invoices','jobs','repair_reports','breakdown_reports',
               'followups','notes','activities','leads','equipment','quotes','contacts','expenses','vehicle_checks',
               'custom_faults','company_documents','machine_jack_confirmations','team_notifications','clients']::text[];
$$;

do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''time_entries''' in d) = 0 then
    d := replace(d, '''stock_movements''];', '''stock_movements'',''time_entries''];');
    execute d;
  end if;
end $$;
