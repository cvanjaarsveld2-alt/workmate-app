-- ── Automatic reminders ───────────────────────────────────────────────────────
-- Once a day the database reminds the people who own the work:
--   * invoices past their due date, at 1, 7, 14 and 30 days;
--   * quotes with no answer 3, 7 and 14 days after they were sent;
--   * machines due for a service in the next 14 days that no service plan
--     covers;
--   * items at or below their reorder level (to the master account and
--     admins, once a week).
-- Each reminder is sent once (reminder_log). A company can switch them off in
-- Company Details. Reminders to customers themselves (email) are sent by the
-- customer-reminders edge function when the company has switched that on.
alter table public.team_profiles add column if not exists auto_reminders boolean not null default true;
alter table public.team_profiles add column if not exists email_customer_reminders boolean not null default false;

create table if not exists public.reminder_log (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('invoice_overdue', 'quote_chase', 'service_due', 'low_stock', 'customer_invoice_email')),
  record_id uuid not null,
  stage int not null,
  sent_at timestamptz not null default now(),
  unique (kind, record_id, stage)
);
alter table public.reminder_log enable row level security;
drop policy if exists reminder_log_select on public.reminder_log;
create policy reminder_log_select on public.reminder_log for select to authenticated using (private.can_see_team(team_id));
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;

-- Logs a reminder; true only the first time (so each goes out once).
create or replace function private.remind_once(p_team uuid, p_kind text, p_record uuid, p_stage int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.reminder_log (team_id, kind, record_id, stage) values (p_team, p_kind, p_record, p_stage)
  on conflict (kind, record_id, stage) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function private.remind_once(uuid, text, uuid, int) from public, anon, authenticated;

create or replace function private.daily_reminders() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_stage int;
  n_inv int := 0; n_quote int := 0; n_service int := 0; n_stock int := 0;
begin
  -- Overdue invoices.
  for r in
    select i.id, i.team_id, i.user_id, i.invoice_number, i.due_date, coalesce(i.balance_due, i.total) as balance,
           current_date - i.due_date as days, coalesce(c.company, 'customer') as client
      from public.invoices i
      join public.team_profiles tp on tp.team_id = i.team_id and tp.auto_reminders
      left join public.clients c on c.id = i.client_id
     where i.team_id is not null and i.due_date < current_date and i.due_date > current_date - 400
       and coalesce(i.balance_due, i.total) > 0 and coalesce(i.status, '') not in ('paid', 'draft', 'cancelled', 'void')
       and private.team_access(i.team_id) = 'full'
  loop
    v_stage := case when r.days >= 30 then 30 when r.days >= 14 then 14 when r.days >= 7 then 7 else 1 end;
    if private.remind_once(r.team_id, 'invoice_overdue', r.id, v_stage) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      values (r.team_id, r.user_id, r.user_id, 'invoice', r.id, coalesce(r.invoice_number, 'Invoice'),
              format('%s is %s day%s overdue: R %s owing from %s. Send them a reminder?', coalesce(r.invoice_number, 'An invoice'),
                     r.days, case when r.days = 1 then '' else 's' end, to_char(r.balance, 'FM999G999G990D00'), r.client));
      n_inv := n_inv + 1;
    end if;
  end loop;

  -- Quotes with no answer.
  for r in
    select q.id, q.team_id, coalesce(q.assigned_to_user_id, q.user_id) as owner, q.user_id, q.quote_number, q.value,
           current_date - coalesce(q.sent_date, q.created_at::date) as days, coalesce(c.company, q.client_name, 'the client') as client
      from public.quotes q
      join public.team_profiles tp on tp.team_id = q.team_id and tp.auto_reminders
      left join public.clients c on c.id = q.client_id
     where q.team_id is not null and q.accepted_at is null and q.declined_at is null
       and coalesce(q.status, '') in ('Pending', 'Sent', 'Follow Up')
       and coalesce(q.sent_date, q.created_at::date) between current_date - 30 and current_date - 3
       and (q.expiry_date is null or q.expiry_date >= current_date)
       and private.team_access(q.team_id) = 'full'
  loop
    v_stage := case when r.days >= 14 then 14 when r.days >= 7 then 7 else 3 end;
    if private.remind_once(r.team_id, 'quote_chase', r.id, v_stage) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      values (r.team_id, r.user_id, r.owner, 'quote', r.id, r.client,
              format('No answer yet on quote %s for %s (R %s), sent %s days ago. Worth a follow-up call?',
                     coalesce(r.quote_number, ''), r.client, to_char(coalesce(r.value, 0), 'FM999G999G990D00'), r.days));
      n_quote := n_quote + 1;
    end if;
  end loop;

  -- Machines due for a service that no plan covers.
  for r in
    select e.id, e.team_id, coalesce(e.assigned_to_user_id, e.user_id) as owner, e.user_id, e.service_due,
           concat_ws(' ', e.name, e.make, e.model) as machine, coalesce(c.company, e.client, '') as client
      from public.equipment e
      join public.team_profiles tp on tp.team_id = e.team_id and tp.auto_reminders
      left join public.clients c on c.id = e.client_id
     where e.team_id is not null and e.service_due between current_date and current_date + 14
       and not exists (select 1 from public.service_plans s where s.equipment_id = e.id and s.active)
       and private.team_access(e.team_id) = 'full'
  loop
    if private.remind_once(r.team_id, 'service_due', r.id, (r.service_due - date '2000-01-01')) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      values (r.team_id, r.user_id, r.owner, 'equipment', r.id, coalesce(nullif(r.machine, ''), 'Machine'),
              format('Service due %s: %s%s. Book it in, or add a service plan so it books itself.',
                     to_char(r.service_due, 'DD Mon'), coalesce(nullif(r.machine, ''), 'a machine'),
                     case when r.client <> '' then ' at ' || r.client else '' end));
      n_service := n_service + 1;
    end if;
  end loop;

  -- Low stock, once a week per company, to the master account and admins.
  for r in
    select p.team_id, count(*) as items, string_agg(coalesce(p.part_number || ' ', '') || p.name, ', ' order by p.name) as names
      from public.products p
      join public.team_profiles tp on tp.team_id = p.team_id and tp.auto_reminders
     where p.track_stock and p.active and p.stock_on_hand <= p.reorder_level and private.team_access(p.team_id) = 'full'
     group by p.team_id
  loop
    if private.remind_once(r.team_id, 'low_stock', r.team_id, (extract(isoyear from current_date) * 100 + extract(week from current_date))::int) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      select r.team_id, t.owner_user_id, m.user_id, 'products', r.team_id, 'Low stock',
             format('%s item%s at or below the reorder level: %s', r.items, case when r.items = 1 then '' else 's' end, left(r.names, 300))
        from public.teams t
        join public.team_members m on m.team_id = t.id and (m.role = 'admin' or m.user_id = t.owner_user_id)
       where t.id = r.team_id;
      n_stock := n_stock + 1;
    end if;
  end loop;

  return jsonb_build_object('invoices', n_inv, 'quotes', n_quote, 'service', n_service, 'low_stock', n_stock);
end $$;
revoke execute on function private.daily_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-daily-reminders') then
    perform cron.unschedule('powermate-daily-reminders');
  end if;
  -- 05:20 UTC = 07:20 in South Africa, before the working day.
  perform cron.schedule('powermate-daily-reminders', '20 5 * * *', 'select private.daily_reminders();');
end $$;

create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['reminder_log','client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment',
               'quotes','contacts','expenses','vehicle_checks','custom_faults','company_documents',
               'machine_jack_confirmations','team_notifications','clients']::text[];
$$;
