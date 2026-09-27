-- ── Suppliers, purchase orders and job profit ─────────────────────────────────
-- Suppliers: who the company buys from.
-- Purchase orders: parts ordered from a supplier, optionally for a job.
--   Receiving a PO adds tracked items to stock (as stock movements, like any
--   other stock change) and can update the item's cost price.
-- Job profit: per job, what it earned (invoiced, else quoted) against what it
--   cost: labour and travel time, parts used (at cost), purchase orders and
--   expenses booked to the job.
--
-- New plan features (in Pro and Enterprise; trial and Free include
-- everything): job_profit, purchase_orders, messages, forms, tech_location.

-- ── Features ──
create or replace function private.all_features() returns text[]
language sql immutable set search_path = '' as $$
  select array['products', 'schedule', 'service_plans', 'timesheets', 'reminders', 'online_payments', 'xero',
               'job_profit', 'purchase_orders', 'messages', 'forms', 'tech_location']::text[];
$$;
update private.platform_settings
   set value = jsonb_set(jsonb_set(value,
         '{pro,features}', (value -> 'pro' -> 'features') || '["job_profit", "purchase_orders", "messages", "forms", "tech_location"]'::jsonb),
         '{enterprise,features}', (value -> 'enterprise' -> 'features') || '["job_profit", "purchase_orders", "messages", "forms", "tech_location"]'::jsonb),
       updated_at = now()
 where key = 'plans' and not (value -> 'pro' -> 'features') ? 'job_profit';

-- ── Suppliers ──
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid(),
  name text not null check (length(name) between 1 and 160),
  contact_name text check (length(contact_name) <= 120),
  email text check (length(email) <= 160),
  phone text check (length(phone) <= 40),
  account_no text check (length(account_no) <= 60),
  vat_number text check (length(vat_number) <= 30),
  address text check (length(address) <= 500),
  notes text check (length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suppliers_team_name_idx on public.suppliers (team_id, name);

-- ── Purchase orders ──
-- lines: [{ product_id?, part_number?, description, qty, unit_cost, received_qty }]
alter table public.team_profiles add column if not exists next_po_number integer not null default 1;
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid(),
  po_number text check (length(po_number) <= 30),
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text check (length(supplier_name) <= 160),
  job_id uuid references public.jobs(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'partial', 'received', 'cancelled')),
  order_date date not null default current_date,
  expected_date date,
  supplier_ref text check (length(supplier_ref) <= 60),
  notes text check (length(notes) <= 2000),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 200),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  vat numeric(12,2) not null default 0 check (vat >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists purchase_orders_team_number_uidx on public.purchase_orders (team_id, po_number) where po_number is not null;
create index if not exists purchase_orders_team_date_idx on public.purchase_orders (team_id, order_date desc);
create index if not exists purchase_orders_job_idx on public.purchase_orders (job_id) where job_id is not null;

-- Expenses can be booked to a job (e.g. a part bought over the counter).
alter table public.expenses add column if not exists job_id uuid references public.jobs(id) on delete set null;
create index if not exists expenses_job_idx on public.expenses (job_id) where job_id is not null;

drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
drop trigger if exists purchase_orders_updated_at on public.purchase_orders;
create trigger purchase_orders_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();

-- PO numbers: PO-0001, PO-0002 … per company, given by the database.
create or replace function private.purchase_order_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if new.po_number is null or trim(new.po_number) = '' then
    insert into public.team_profiles (team_id) values (new.team_id) on conflict (team_id) do nothing;
    update public.team_profiles set next_po_number = next_po_number + 1
     where team_id = new.team_id returning next_po_number - 1 into n;
    new.po_number := 'PO-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;
revoke execute on function private.purchase_order_number() from public, anon, authenticated;
drop trigger if exists purchase_orders_number on public.purchase_orders;
create trigger purchase_orders_number before insert on public.purchase_orders
  for each row execute function private.purchase_order_number();

-- ── Access: everyone in the company can see them; master account and admins manage ──
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
do $$
declare t text; f text;
begin
  foreach t in array array['suppliers', 'purchase_orders'] loop
    f := 'purchase_orders';
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.same_team(team_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
      with check (private.same_team(team_id) and private.is_team_manager(team_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
      using (private.same_team(team_id) and private.is_team_manager(team_id))
      with check (private.same_team(team_id) and private.is_team_manager(team_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated
      using (private.same_team(team_id) and private.is_team_manager(team_id))', t || '_delete', t);
    -- Read-only / suspended companies, and the plan's features.
    execute format('drop policy if exists %I on public.%I', t || '_plan_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_delete', t);
    execute format('drop policy if exists %I on public.%I', t || '_plan_feature', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated
      using (private.team_access(team_id) <> ''suspended'')', t || '_plan_read', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (private.team_access(team_id) = ''full'')', t || '_plan_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated
      using (private.team_access(team_id) = ''full'') with check (private.team_access(team_id) = ''full'')', t || '_plan_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated
      using (private.team_access(team_id) = ''full'')', t || '_plan_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated
      with check (private.team_has_feature(team_id, %L))', t || '_plan_feature', t, f);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()', 'audit_' || t, t);
  end loop;
end $$;
-- Receiving only happens through receive_purchase_order (it also moves stock).
revoke update on public.purchase_orders from authenticated;
grant update (po_number, supplier_id, supplier_name, job_id, status, order_date, expected_date, supplier_ref, notes,
              lines, subtotal, vat, total) on public.purchase_orders to authenticated;

-- ── Receive a purchase order (all of it, or some lines) ──
-- p_lines: [{ "i": line index, "qty": quantity received now }]; null = the rest of everything.
create or replace function private.receive_purchase_order(p_po_id uuid, p_lines jsonb, p_update_costs boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders;
  v_lines jsonb;
  v_line jsonb;
  v_i integer;
  v_now numeric;
  v_left numeric;
  v_all boolean := true;
  v_moved integer := 0;
  v_track boolean;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found or not private.same_team(v_po.team_id) then raise exception 'Purchase order not found'; end if;
  if not private.is_team_manager(v_po.team_id) then raise exception 'Only the master account or an admin can receive stock'; end if;
  if private.team_access(v_po.team_id) <> 'full' then raise exception 'Your account is read-only'; end if;
  if v_po.status in ('cancelled', 'received') then raise exception 'This order is already %', v_po.status; end if;
  v_lines := v_po.lines;
  for v_i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_line := v_lines -> v_i;
    v_left := greatest(coalesce((v_line ->> 'qty')::numeric, 0) - coalesce((v_line ->> 'received_qty')::numeric, 0), 0);
    if p_lines is null then
      v_now := v_left;
    else
      select least(greatest(coalesce((x ->> 'qty')::numeric, 0), 0), v_left) into v_now
        from jsonb_array_elements(p_lines) x where (x ->> 'i')::int = v_i;
      v_now := coalesce(v_now, 0);
    end if;
    if v_now > 0 then
      v_lines := jsonb_set(v_lines, array[v_i::text, 'received_qty'],
                           to_jsonb(coalesce((v_line ->> 'received_qty')::numeric, 0) + v_now));
      if v_line ? 'product_id' and (v_line ->> 'product_id') ~ '^[0-9a-f-]{36}$' then
        select track_stock into v_track from public.products
         where id = (v_line ->> 'product_id')::uuid and team_id = v_po.team_id;
        if coalesce(v_track, false) then
          insert into public.stock_movements (team_id, product_id, qty_change, reason, job_id, note)
          values (v_po.team_id, (v_line ->> 'product_id')::uuid, v_now, 'receive', v_po.job_id, left('Received on ' || v_po.po_number, 300));
          v_moved := v_moved + 1;
        end if;
        if p_update_costs and coalesce((v_line ->> 'unit_cost')::numeric, 0) > 0 then
          update public.products set cost_price = round((v_line ->> 'unit_cost')::numeric, 2), updated_at = now()
           where id = (v_line ->> 'product_id')::uuid and team_id = v_po.team_id;
        end if;
      end if;
    end if;
    if coalesce((v_lines -> v_i ->> 'received_qty')::numeric, 0) < coalesce((v_line ->> 'qty')::numeric, 0) then v_all := false; end if;
  end loop;
  update public.purchase_orders
     set lines = v_lines, status = case when v_all then 'received' else 'partial' end,
         received_at = case when v_all then now() else received_at end, updated_at = now()
   where id = v_po.id;
  return jsonb_build_object('status', case when v_all then 'received' else 'partial' end, 'stock_lines', v_moved);
end $$;
revoke execute on function private.receive_purchase_order(uuid, jsonb, boolean) from public, anon;
grant execute on function private.receive_purchase_order(uuid, jsonb, boolean) to authenticated;
create or replace function public.receive_purchase_order(p_po_id uuid, p_lines jsonb default null, p_update_costs boolean default true)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.receive_purchase_order(p_po_id, p_lines, p_update_costs);
$$;
revoke execute on function public.receive_purchase_order(uuid, jsonb, boolean) from public, anon;
grant execute on function public.receive_purchase_order(uuid, jsonb, boolean) to authenticated;

-- ── Job profit: the raw numbers per job (the app works out labour cost and margin) ──
create or replace function private.job_costs(p_team_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.same_team(p_team_id) and private.is_team_manager(p_team_id)) then
    raise exception 'Only the master account or an admin can see job profit';
  end if;
  if not private.team_has_feature(p_team_id, 'job_profit') then raise exception 'Job profit is part of the Pro plan'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(r) order by r.job_date desc nulls last) from (
      select j.id, j.job_number, j.title, j.status, j.client_id, j.assigned_to_user_id, j.quote_id,
             coalesce(j.completed_at::date, j.scheduled_date, j.created_at::date) as job_date,
             -- What it earned: invoices (excl. VAT, not cancelled) …
             (select coalesce(sum(i.subtotal), 0) from public.invoices i
               where i.job_id = j.id and i.team_id = p_team_id and i.status <> 'cancelled') as invoiced,
             -- … or, until invoiced, the quote (excl. VAT).
             (select case when q.vat_inclusive then round(q.value / 1.15, 2) else q.value end
                from public.quotes q where q.id = j.quote_id and q.team_id = p_team_id) as quoted,
             (select coalesce(sum(extract(epoch from (least(coalesce(t.ended_at, now()), t.started_at + interval '24 hours') - t.started_at)) / 60), 0)::int
                from public.time_entries t where t.job_id = j.id and t.team_id = p_team_id and coalesce(t.kind, 'work') <> 'travel') as work_minutes,
             (select coalesce(sum(extract(epoch from (least(coalesce(t.ended_at, now()), t.started_at + interval '24 hours') - t.started_at)) / 60), 0)::int
                from public.time_entries t where t.job_id = j.id and t.team_id = p_team_id and t.kind = 'travel') as travel_minutes,
             -- Parts used, at cost (the cost saved on the job, else the catalogue's).
             (select coalesce(sum(
                       coalesce(nullif(p ->> 'quantity', '')::numeric, 1) *
                       coalesce(nullif(p ->> 'cost_price', '')::numeric,
                                (select pr.cost_price from public.products pr
                                  where pr.team_id = p_team_id and pr.id::text = p ->> 'product_id'), 0)), 0)
                from jsonb_array_elements(case when jsonb_typeof(j.parts_used) = 'array' then j.parts_used else '[]'::jsonb end) p
               where jsonb_typeof(p) = 'object') as parts_cost,
             -- Ordered for the job: lines that don't go into stock (stock items
             -- count when they're used on the job, as parts above).
             (select coalesce(sum(coalesce(nullif(l ->> 'qty', '')::numeric, 0) * coalesce(nullif(l ->> 'unit_cost', '')::numeric, 0)), 0)
                from public.purchase_orders po, jsonb_array_elements(po.lines) l
               where po.job_id = j.id and po.team_id = p_team_id and po.status not in ('cancelled', 'draft')
                 and not exists (select 1 from public.products pr
                                  where pr.team_id = p_team_id and pr.track_stock and pr.id::text = l ->> 'product_id')) as po_cost,
             (select coalesce(sum(coalesce(e.amount_zar, e.amount) - coalesce(e.vat_amount, 0)), 0) from public.expenses e
               where e.job_id = j.id and e.team_id = p_team_id) as expense_cost
        from public.jobs j
       where j.team_id = p_team_id and j.status <> 'cancelled'
         and coalesce(j.completed_at::date, j.scheduled_date, j.created_at::date) between p_from and p_to
       limit 2000) r), '[]'::jsonb);
end $$;
revoke execute on function private.job_costs(uuid, date, date) from public, anon;
grant execute on function private.job_costs(uuid, date, date) to authenticated;
create or replace function public.job_costs(p_team_id uuid, p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.job_costs(p_team_id, p_from, p_to); $$;
revoke execute on function public.job_costs(uuid, date, date) from public, anon;
grant execute on function public.job_costs(uuid, date, date) to authenticated;

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['purchase_orders','suppliers','reminder_log','client_portal_links','stock_movements','products','time_entries',
               'payments','invoices','jobs','service_plans','repair_reports','breakdown_reports','followups','notes','activities',
               'leads','equipment','quotes','contacts','expenses','vehicle_checks','custom_faults','company_documents',
               'machine_jack_confirmations','team_notifications','billing_payments','clients']::text[];
$$;
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''purchase_orders''' in d) = 0 then
    d := replace(d, '''time_entries'',''service_plans''];', '''time_entries'',''service_plans'',''suppliers'',''purchase_orders''];');
    if position('''purchase_orders''' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
