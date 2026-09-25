-- ── Products & stock ─────────────────────────────────────────────────────────
-- Each company keeps its own catalogue of parts, materials and services with
-- part numbers, cost and selling prices (excluding VAT) and, optionally, stock
-- levels. Everyone in the company, whatever their data access, can read the
-- catalogue (to pick items on quotes and jobs); the master account and admins
-- edit it.
--
-- Stock on hand only ever changes through stock_movements, so every change is
-- recorded:
--   * adjust_stock()  : stock received, a stock count, or a correction;
--   * import_products(): opening stock on a CSV import;
--   * jobs trigger    : parts used on a completed job (catalogue items only).
--     The trigger keeps the job's movements equal to its parts list, so
--     editing the parts on a completed job, or reopening it, corrects stock.
create or replace function private.is_team_manager(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_team_owner(p_team_id) or public.is_team_admin(p_team_id);
$$;
revoke execute on function private.is_team_manager(uuid) from public, anon;
grant execute on function private.is_team_manager(uuid) to authenticated;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid(),
  part_number text check (length(part_number) <= 60),
  name text not null check (length(name) between 1 and 200),
  description text check (length(description) <= 2000),
  category text check (length(category) <= 80),
  unit text not null default 'each' check (length(unit) <= 20),
  sell_price numeric(12,2) not null default 0 check (sell_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  vat_applicable boolean not null default true,
  supplier text check (length(supplier) <= 120),
  supplier_code text check (length(supplier_code) <= 60),
  barcode text check (length(barcode) <= 60),
  track_stock boolean not null default false,
  stock_on_hand numeric(12,3) not null default 0,
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_team_part_uidx on public.products (team_id, lower(part_number))
  where part_number is not null and part_number <> '';
create index if not exists products_team_name_idx on public.products (team_id, name);

create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  qty_change numeric(12,3) not null,
  reason text not null check (reason in ('receive', 'count', 'adjust', 'job', 'import')),
  job_id uuid,
  note text check (length(note) <= 300),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_job_idx on public.stock_movements (job_id) where job_id is not null;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- Stock on hand follows the movements.
create or replace function private.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.products set stock_on_hand = stock_on_hand + new.qty_change, updated_at = now()
   where id = new.product_id and team_id = new.team_id;
  return null;
end $$;
revoke execute on function private.apply_stock_movement() from public, anon, authenticated;
drop trigger if exists stock_movements_apply on public.stock_movements;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function private.apply_stock_movement();

-- ── Access ──
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists products_select on public.products;
drop policy if exists products_insert on public.products;
drop policy if exists products_update on public.products;
drop policy if exists products_delete on public.products;
create policy products_select on public.products for select to authenticated using (private.same_team(team_id));
create policy products_insert on public.products for insert to authenticated
  with check (private.same_team(team_id) and private.is_team_manager(team_id) and stock_on_hand = 0);
create policy products_update on public.products for update to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id))
  with check (private.same_team(team_id) and private.is_team_manager(team_id));
create policy products_delete on public.products for delete to authenticated
  using (private.same_team(team_id) and private.is_team_manager(team_id));

drop policy if exists stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated using (private.same_team(team_id));

-- Stock on hand can't be written directly (only through movements).
revoke all on public.products from anon;
revoke update on public.products from authenticated;
grant select, insert, delete on public.products to authenticated;
grant update (part_number, name, description, category, unit, sell_price, cost_price, vat_applicable, supplier,
  supplier_code, barcode, track_stock, reorder_level, active) on public.products to authenticated;
revoke all on public.stock_movements from anon;
revoke insert, update, delete on public.stock_movements from authenticated;
grant select on public.stock_movements to authenticated;

do $$
declare t text;
begin
  foreach t in array array['products', 'stock_movements'] loop
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

-- Catalogue edits go in the activity log; stock level changes are already
-- recorded as movements, so they're left out.
drop trigger if exists audit_products on public.products;
drop trigger if exists audit_products_update on public.products;
create trigger audit_products after insert or delete on public.products
  for each row execute function private.audit_row();
create trigger audit_products_update after update on public.products
  for each row when ((to_jsonb(old) - 'stock_on_hand' - 'updated_at') is distinct from (to_jsonb(new) - 'stock_on_hand' - 'updated_at'))
  execute function private.audit_row();

-- ── Stock received / counted / corrected ──
create or replace function private.adjust_stock(p_product_id uuid, p_reason text, p_qty numeric, p_note text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_p public.products;
  v_change numeric;
begin
  select * into v_p from public.products where id = p_product_id for update;
  if not found or not private.same_team(v_p.team_id) then raise exception 'Product not found'; end if;
  if not private.is_team_manager(v_p.team_id) then raise exception 'Only the master account or an admin can change stock'; end if;
  if private.team_access(v_p.team_id) <> 'full' then raise exception 'Your account is read-only'; end if;
  if p_qty is null or abs(p_qty) > 1000000 then raise exception 'Enter a quantity'; end if;
  v_change := case p_reason
    when 'receive' then abs(p_qty)
    when 'count' then p_qty - v_p.stock_on_hand
    when 'adjust' then p_qty
    else null end;
  if v_change is null then raise exception 'Unknown stock change'; end if;
  if v_change <> 0 then
    insert into public.stock_movements (team_id, product_id, qty_change, reason, note)
    values (v_p.team_id, v_p.id, v_change, p_reason, left(nullif(trim(coalesce(p_note, '')), ''), 300));
  end if;
  return v_p.stock_on_hand + v_change;
end $$;

-- ── CSV import: add new items and update existing ones by part number ──
create or replace function private.import_products(p_team_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_id uuid;
  v_part text;
  v_name text;
  v_added int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  num text := '^-?[0-9]+(\.[0-9]+)?$';
begin
  if not private.same_team(p_team_id) or not private.is_team_manager(p_team_id) then
    raise exception 'Only the master account or an admin can import products';
  end if;
  if private.team_access(p_team_id) <> 'full' then raise exception 'Your account is read-only'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Import up to 5000 products at a time';
  end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    v_part := nullif(left(trim(coalesce(r ->> 'part_number', '')), 60), '');
    v_name := nullif(left(trim(coalesce(r ->> 'name', '')), 200), '');
    if v_name is null then v_skipped := v_skipped + 1; continue; end if;
    v_id := null;
    if v_part is not null then
      select id into v_id from public.products where team_id = p_team_id and lower(part_number) = lower(v_part);
    end if;
    if v_id is not null then
      update public.products set
        name = v_name,
        description = coalesce(nullif(left(r ->> 'description', 2000), ''), description),
        category = coalesce(nullif(left(r ->> 'category', 80), ''), category),
        unit = coalesce(nullif(left(r ->> 'unit', 20), ''), unit),
        sell_price = case when r ->> 'sell_price' ~ num then greatest((r ->> 'sell_price')::numeric, 0) else sell_price end,
        cost_price = case when r ->> 'cost_price' ~ num then greatest((r ->> 'cost_price')::numeric, 0) else cost_price end,
        supplier = coalesce(nullif(left(r ->> 'supplier', 120), ''), supplier),
        supplier_code = coalesce(nullif(left(r ->> 'supplier_code', 60), ''), supplier_code),
        reorder_level = case when r ->> 'reorder_level' ~ num then greatest((r ->> 'reorder_level')::numeric, 0) else reorder_level end,
        track_stock = coalesce((r ->> 'track_stock')::boolean, track_stock),
        active = true
      where id = v_id;
      v_updated := v_updated + 1;
    else
      insert into public.products (team_id, part_number, name, description, category, unit, sell_price, cost_price,
                                   supplier, supplier_code, reorder_level, track_stock)
      values (p_team_id, v_part, v_name, nullif(left(r ->> 'description', 2000), ''), nullif(left(r ->> 'category', 80), ''),
              coalesce(nullif(left(r ->> 'unit', 20), ''), 'each'),
              case when r ->> 'sell_price' ~ num then greatest((r ->> 'sell_price')::numeric, 0) else 0 end,
              case when r ->> 'cost_price' ~ num then greatest((r ->> 'cost_price')::numeric, 0) else 0 end,
              nullif(left(r ->> 'supplier', 120), ''), nullif(left(r ->> 'supplier_code', 60), ''),
              case when r ->> 'reorder_level' ~ num then greatest((r ->> 'reorder_level')::numeric, 0) else 0 end,
              coalesce((r ->> 'track_stock')::boolean, r ->> 'stock_on_hand' ~ num))
      returning id into v_id;
      if r ->> 'stock_on_hand' ~ num and (r ->> 'stock_on_hand')::numeric <> 0 then
        insert into public.stock_movements (team_id, product_id, qty_change, reason, note)
        values (p_team_id, v_id, (r ->> 'stock_on_hand')::numeric, 'import', 'Opening stock');
      end if;
      v_added := v_added + 1;
    end if;
  end loop;
  return jsonb_build_object('added', v_added, 'updated', v_updated, 'skipped', v_skipped);
end $$;

-- ── Parts used on completed jobs come off stock ──
-- A part is a catalogue item when it carries product_id. Quantities per
-- product on a completed job are compared with what's already been taken off
-- for that job, and only the difference is recorded. A job that isn't
-- completed (or is reopened) has a target of zero, which puts stock back.
create or replace function private.job_stock_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rec record;
begin
  if new.team_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.parts_used is not distinct from old.parts_used then
    return null;
  end if;
  for rec in
    with wanted as (
      select (e ->> 'product_id')::uuid as product_id,
             sum(case when e ->> 'quantity' ~ '^[0-9]+(\.[0-9]+)?$' then (e ->> 'quantity')::numeric else 1 end) as qty
        from jsonb_array_elements(case when jsonb_typeof(new.parts_used) = 'array' and new.status = 'completed'
                                       then new.parts_used else '[]'::jsonb end) e
       where jsonb_typeof(e) = 'object'
         and e ->> 'product_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       group by 1),
    taken as (
      select product_id, -sum(qty_change) as qty from public.stock_movements
       where job_id = new.id and reason = 'job' group by 1)
    select p.id as product_id, coalesce(w.qty, 0) - coalesce(t.qty, 0) as diff
      from public.products p
      left join wanted w on w.product_id = p.id
      left join taken t on t.product_id = p.id
     where p.team_id = new.team_id and p.track_stock
       and (w.product_id is not null or t.product_id is not null)
  loop
    if rec.diff <> 0 then
      insert into public.stock_movements (team_id, product_id, qty_change, reason, job_id, note, user_id)
      values (new.team_id, rec.product_id, -rec.diff, 'job', new.id,
              left(coalesce(new.job_number, new.title, 'Job'), 300), auth.uid());
    end if;
  end loop;
  return null;
end $$;
revoke execute on function private.job_stock_sync() from public, anon, authenticated;
drop trigger if exists jobs_stock_sync on public.jobs;
create trigger jobs_stock_sync after insert or update of status, parts_used on public.jobs
  for each row execute function private.job_stock_sync();

revoke execute on function private.adjust_stock(uuid, text, numeric, text) from public, anon;
revoke execute on function private.import_products(uuid, jsonb) from public, anon;
grant execute on function private.adjust_stock(uuid, text, numeric, text) to authenticated;
grant execute on function private.import_products(uuid, jsonb) to authenticated;

create or replace function public.adjust_stock(p_product_id uuid, p_reason text, p_qty numeric, p_note text default null)
returns numeric language sql security invoker set search_path = '' as $$
  select private.adjust_stock(p_product_id, p_reason, p_qty, p_note);
$$;
create or replace function public.import_products(p_team_id uuid, p_rows jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.import_products(p_team_id, p_rows);
$$;
revoke execute on function public.adjust_stock(uuid, text, numeric, text) from public, anon;
revoke execute on function public.import_products(uuid, jsonb) from public, anon;
grant execute on function public.adjust_stock(uuid, text, numeric, text) to authenticated;
grant execute on function public.import_products(uuid, jsonb) to authenticated;

-- ── Company export / deletion include the catalogue ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['stock_movements','products','payments','invoices','jobs','repair_reports','breakdown_reports','followups',
               'notes','activities','leads','equipment','quotes','contacts','expenses','vehicle_checks','custom_faults',
               'company_documents','machine_jack_confirmations','team_notifications','clients']::text[];
$$;

-- ── The two-company isolation test reads the new tables too ──
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''products''' in d) = 0 then
    d := replace(d, '''vehicle_checks''];', '''vehicle_checks'',''products'',''stock_movements''];');
    execute d;
  end if;
end $$;
