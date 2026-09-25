-- ── Activity log: who changed what ───────────────────────────────────────────
-- Written only by database triggers (nobody can add, edit or delete entries),
-- readable by the company's owner and admins. Records the fields that changed
-- with their old and new values; big fields (logos, photos, write-ups, line
-- items) are noted as changed without their contents.
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  team_id uuid,
  user_id uuid,
  table_name text not null,
  record_id text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_team_time_idx on public.audit_log (team_id, created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (
  team_id is not null and exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
     where tm.team_id = audit_log.team_id and tm.user_id = (select auth.uid())
       and (tm.role = 'admin' or t.owner_user_id = (select auth.uid()))));
grant select on public.audit_log to authenticated;

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  k text;
  big text[] := array['logo_data', 'photos', 'media', 'details', 'line_items', 'items', 'engineering', 'data', 'interactions', 'attachments'];
  skip text[] := array['updated_at', 'sync_status', 'created_at'];
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      continue when k = any(skip);
      if v_new -> k is distinct from v_old -> k then
        v_changes := v_changes || jsonb_build_object(k,
          case when k = any(big) then '"(changed)"'::jsonb
               else jsonb_build_object('from', v_old -> k, 'to', v_new -> k) end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return null; end if;
  end if;
  insert into public.audit_log (team_id, user_id, table_name, record_id, action, changes, label)
  values (
    coalesce((v_row ->> 'team_id')::uuid, null),
    auth.uid(),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'team_id', v_row ->> 'user_id'),
    lower(tg_op),
    case when tg_op = 'UPDATE' then v_changes end,
    left(coalesce(v_row ->> 'company', v_row ->> 'client_name', v_row ->> 'invoice_number', v_row ->> 'quote_number',
                  v_row ->> 'job_number', v_row ->> 'name', v_row ->> 'title', v_row ->> 'trading_name', v_row ->> 'reference', ''), 120));
  return null;
end $$;
revoke execute on function private.audit_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['clients','contacts','quotes','invoices','payments','jobs','team_members','team_profiles'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function private.audit_row()', t);
  end loop;
end $$;
