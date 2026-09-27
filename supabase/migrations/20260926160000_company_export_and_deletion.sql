-- ── POPIA: company data export and deletion ──────────────────────────────────
-- export_company_data(): the master account downloads everything its company
-- holds (every company table), e.g. when leaving or for an access request.
-- request_company_deletion(): the master account asks for the company's data
-- to be deleted; platform admins see the request and, after the notice period
-- in the terms, run admin_delete_company().
alter table public.team_plans add column if not exists deletion_requested_at timestamptz;
alter table public.team_plans add column if not exists deletion_requested_by uuid;

create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['payments','invoices','jobs','repair_reports','breakdown_reports','followups','notes','activities',
               'leads','equipment','quotes','contacts','expenses','vehicle_checks','custom_faults',
               'company_documents','machine_jack_confirmations','team_notifications','clients']::text[];
$$;

create or replace function private.export_company_data(p_team_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text;
  rows jsonb;
  out jsonb;
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can export company data'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  out := jsonb_build_object(
    'exported_at', now(),
    'company', (select to_jsonb(x) from public.teams x where x.id = p_team_id),
    'company_details', (select to_jsonb(x) - 'logo_data' from public.team_profiles x where x.team_id = p_team_id),
    'plan', (select to_jsonb(x) from public.team_plans x where x.team_id = p_team_id),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'joined_at', m.joined_at)), '[]')
                  from public.team_members m left join auth.users u on u.id = m.user_id where m.team_id = p_team_id));
  foreach t in array private.company_tables() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from public.%I x where x.team_id = $1', t) into rows using p_team_id;
    out := out || jsonb_build_object(t, rows);
  end loop;
  insert into public.events (user_id, name, data, "timestamp") values (auth.uid(), 'company_exported', jsonb_build_object('team_id', p_team_id), now());
  return out;
end $$;

create or replace function private.request_company_deletion(p_team_id uuid, p_cancel boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can do this'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  insert into public.team_plans (team_id) values (p_team_id) on conflict (team_id) do nothing;
  update public.team_plans
     set deletion_requested_at = case when p_cancel then null else now() end,
         deletion_requested_by = case when p_cancel then null else auth.uid() end,
         updated_at = now()
   where team_id = p_team_id;
  insert into public.events (user_id, name, data, "timestamp")
  values (auth.uid(), case when p_cancel then 'company_deletion_cancelled' else 'company_deletion_requested' end, jsonb_build_object('team_id', p_team_id), now());
end $$;

-- Deletes every company record and the company itself. People's accounts stay
-- (they may belong to another company); their personal records stay too.
-- Photos and files in Storage are removed separately (see docs/GO_LIVE_GATES.md).
create or replace function private.admin_delete_company(p_team_id uuid, p_confirm_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t text;
  n int;
  total int := 0;
  v_name text;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  select name into v_name from public.teams where id = p_team_id;
  if v_name is null then raise exception 'Company not found'; end if;
  if p_confirm_name is distinct from v_name then raise exception 'Type the company name exactly to confirm'; end if;
  if not exists (select 1 from public.team_plans where team_id = p_team_id and deletion_requested_at is not null) then
    raise exception 'The company has not asked for deletion';
  end if;
  foreach t in array private.company_tables() loop
    execute format('delete from public.%I where team_id = $1', t) using p_team_id;
    get diagnostics n = row_count;
    total := total + n;
  end loop;
  delete from public.teams where id = p_team_id;
  insert into public.events (user_id, name, data, "timestamp")
  values (auth.uid(), 'company_deleted', jsonb_build_object('team_id', p_team_id, 'name', v_name, 'records', total), now());
  return jsonb_build_object('records_deleted', total);
end $$;

revoke execute on function private.export_company_data(uuid) from public, anon;
revoke execute on function private.request_company_deletion(uuid, boolean) from public, anon;
revoke execute on function private.admin_delete_company(uuid, text) from public, anon;
grant execute on function private.export_company_data(uuid) to authenticated;
grant execute on function private.request_company_deletion(uuid, boolean) to authenticated;
grant execute on function private.admin_delete_company(uuid, text) to authenticated;
create or replace function public.export_company_data(p_team_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.export_company_data(p_team_id); $$;
create or replace function public.request_company_deletion(p_team_id uuid, p_cancel boolean default false) returns void
language sql security invoker set search_path = '' as $$ select private.request_company_deletion(p_team_id, p_cancel); $$;
create or replace function public.admin_delete_company(p_team_id uuid, p_confirm_name text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_delete_company(p_team_id, p_confirm_name); $$;
revoke execute on function public.export_company_data(uuid) from public, anon;
revoke execute on function public.request_company_deletion(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_company(uuid, text) from public, anon;
grant execute on function public.export_company_data(uuid) to authenticated;
grant execute on function public.request_company_deletion(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_company(uuid, text) to authenticated;

-- The console shows deletion requests.
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
             tp.plan, tp.status, tp.trial_ends_at, tp.paid_until, tp.seats, tp.notes, tp.deletion_requested_at,
             private.team_access(t.id) as access
        from public.teams t left join public.team_plans tp on tp.team_id = t.id) c), '[]'::jsonb);
end $$;
