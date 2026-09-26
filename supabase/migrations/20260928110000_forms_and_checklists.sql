-- ── Custom forms & checklists ─────────────────────────────────────────────────
-- A company builds its own forms (safety sign-off, pre-start checklist,
-- inspection sheet …) from simple fields, and technicians fill them in on a
-- job or a machine, with a signature. Filled-in forms keep a copy of the form
-- as it was, so changing a template never changes old records.
--
-- fields: [{ id, type: text|textarea|number|yesno|choice|date|heading, label,
--           required, options: [..] (choice) }]
-- answers: { field id: value }
-- Plan feature: forms (Pro and Enterprise).

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid(),
  name text not null check (length(name) between 1 and 120),
  description text check (length(description) <= 1000),
  applies_to text not null default 'any' check (applies_to in ('any', 'job', 'equipment')),
  require_signature boolean not null default true,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists form_templates_team_idx on public.form_templates (team_id, name);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  template_id uuid references public.form_templates(id) on delete set null,
  template_name text not null check (length(template_name) between 1 and 120),
  fields jsonb not null check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 80),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  job_id uuid references public.jobs(id) on delete set null,
  equipment_id uuid references public.equipment(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and length(signature) <= 200000)),
  signed_by text check (length(signed_by) <= 120),
  filled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists form_submissions_team_idx on public.form_submissions (team_id, filled_at desc);
create index if not exists form_submissions_job_idx on public.form_submissions (job_id) where job_id is not null;
create index if not exists form_submissions_equipment_idx on public.form_submissions (equipment_id) where equipment_id is not null;

drop trigger if exists form_templates_updated_at on public.form_templates;
create trigger form_templates_updated_at before update on public.form_templates for each row execute function public.set_updated_at();

alter table public.form_templates enable row level security;
alter table public.form_submissions enable row level security;
do $$
declare t text;
begin
  foreach t in array array['form_templates', 'form_submissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_delete', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_feature', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.same_team(team_id))', t || '_select', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated
      using (private.team_access(team_id) <> ''suspended'')', t || '_plan_read', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (private.team_access(team_id) = ''full'')', t || '_plan_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated
      using (private.team_access(team_id) = ''full'') with check (private.team_access(team_id) = ''full'')', t || '_plan_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated
      using (private.team_access(team_id) = ''full'')', t || '_plan_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (private.team_has_feature(team_id, ''forms''))', t || '_plan_feature', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
  end loop;
end $$;
-- Templates: the master account and admins.
create policy form_templates_insert on public.form_templates for insert to authenticated
  with check (private.same_team(team_id) and private.is_team_manager(team_id));
create policy form_templates_update on public.form_templates for update to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id))
  with check (private.same_team(team_id) and private.is_team_manager(team_id));
create policy form_templates_delete on public.form_templates for delete to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id));
grant select, insert, update, delete on public.form_templates to authenticated;
create trigger audit_form_templates after insert or update or delete on public.form_templates
  for each row execute function private.audit_row();
-- Filled-in forms: anyone in the company, as themselves; they're a record, so
-- they can't be edited afterwards (managers can delete one made in error).
create policy form_submissions_insert on public.form_submissions for insert to authenticated
  with check (private.same_team(team_id) and user_id = auth.uid());
create policy form_submissions_delete on public.form_submissions for delete to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id));
grant select, insert, delete on public.form_submissions to authenticated;
create trigger audit_form_submissions after delete on public.form_submissions
  for each row execute function private.audit_row();

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['form_submissions','form_templates','customer_messages','purchase_orders','suppliers','reminder_log',
               'client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs','service_plans',
               'repair_reports','breakdown_reports','followups','notes','activities','leads','equipment','quotes','contacts',
               'expenses','vehicle_checks','custom_faults','company_documents','machine_jack_confirmations','team_notifications',
               'billing_payments','clients']::text[];
$$;
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''form_submissions''' in d) = 0 then
    d := replace(d, '''customer_messages''];', '''customer_messages'',''form_templates'',''form_submissions''];');
    if position('''form_submissions''' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
