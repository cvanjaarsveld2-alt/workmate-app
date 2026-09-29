-- Receipts and bills by email (the Inbox on the Expenses screen).
--
-- Each company gets a private forwarding address. Mail sent to it is taken in
-- by the inbound-email Edge Function (service role): each receipt or bill
-- (PDF or photo, or the email itself when there's no attachment) becomes an
-- inbox item, read by AI. Nothing reaches the books until someone reviews it
-- and taps Approve, which makes an expense. Like Dext, Hubdoc and Xero's
-- "email bills in": only what people choose to send is seen.

-- ── Addresses ──
-- Kept out of public.teams so owners can't set a guessable one. The token is
-- the unguessable part of the address (48 random bits).
create table private.inbox_addresses (
  team_id uuid primary key references public.teams(id) on delete cascade,
  token text not null unique check (token ~ '^[a-z0-9]{12}$'),
  created_at timestamptz not null default now()
);

create or replace function private.new_inbox_token() returns text
language sql volatile set search_path = '' as $$
  select substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12);
$$;

-- The company's forwarding token (made on first use). Any member may see it.
create or replace function public.inbox_address(p_team uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if not private.same_team(p_team) then
    raise exception 'Not a member of this company' using errcode = '42501';
  end if;
  select token into v from private.inbox_addresses where team_id = p_team;
  if v is null then
    insert into private.inbox_addresses (team_id, token) values (p_team, private.new_inbox_token())
    on conflict (team_id) do nothing;
    select token into v from private.inbox_addresses where team_id = p_team;
  end if;
  return v;
end $$;

-- A new address, if the old one leaked or gets spam. Master account/admins only.
create or replace function public.reset_inbox_address(p_team uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v text := private.new_inbox_token();
begin
  if not private.is_team_manager(p_team) then
    raise exception 'Only the master account or an admin can change the address' using errcode = '42501';
  end if;
  insert into private.inbox_addresses (team_id, token) values (p_team, v)
  on conflict (team_id) do update set token = excluded.token, created_at = now();
  return v;
end $$;

-- For the inbound-email function only: which company an address belongs to,
-- whose folder its files go in, and whether it may take in mail.
create or replace function public.inbox_team_for_token(p_token text)
returns table (team_id uuid, owner_user_id uuid, access text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.owner_user_id, private.team_access(t.id)
    from private.inbox_addresses a join public.teams t on t.id = a.team_id
   where a.token = lower(p_token);
$$;
revoke execute on function public.inbox_team_for_token(text) from public, anon, authenticated;
grant execute on function public.inbox_team_for_token(text) to service_role;

revoke execute on function public.inbox_address(uuid) from public, anon;
revoke execute on function public.reset_inbox_address(uuid) from public, anon;
grant execute on function public.inbox_address(uuid) to authenticated;
grant execute on function public.reset_inbox_address(uuid) to authenticated;

-- ── Items ──
create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  -- One email can carry several receipts: one item per attachment (part).
  message_id text not null,
  part integer not null default 0,
  from_email text,
  from_name text,
  subject text,
  body_excerpt text,
  received_at timestamptz not null default now(),
  -- In the receipts bucket, under the company owner's folder, so the team can
  -- open it with the same rules as scanned slips.
  file_path text,
  file_name text,
  content_type text,
  file_size integer,
  status text not null default 'new' check (status in ('new', 'ready', 'failed', 'approved', 'rejected')),
  extracted jsonb not null default '{}'::jsonb,
  supplier_id uuid references public.suppliers(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  error text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (team_id, message_id, part)
);
create index inbox_items_team_status_idx on public.inbox_items (team_id, status, received_at desc);
create index inbox_items_supplier_idx on public.inbox_items (supplier_id);
create index inbox_items_expense_idx on public.inbox_items (expense_id);
create index inbox_items_reviewed_by_idx on public.inbox_items (reviewed_by);

alter table public.inbox_items enable row level security;
-- Members read their company's inbox. Items are written only by the
-- inbound-email function (service role) and the review functions below.
create policy inbox_items_select on public.inbox_items for select to authenticated
  using (private.same_team(team_id) and private.team_access(team_id) <> 'suspended');
revoke insert, update, delete on public.inbox_items from anon, authenticated;

-- ── Review ──
-- Approve: makes the expense (for the person approving) with the reviewed
-- details and the emailed file as its slip, in one step.
create or replace function public.approve_inbox_item(p_id uuid, p_fields jsonb)
returns public.expenses language plpgsql security definer set search_path = '' as $$
declare
  it public.inbox_items;
  e public.expenses;
  v_amount numeric;
  v_vat numeric;
  v_currency text := upper(coalesce(nullif(trim(p_fields->>'currency'), ''), 'ZAR'));
  v_date date;
  v_zar numeric;
begin
  select * into it from public.inbox_items where id = p_id for update;
  if not found or not private.same_team(it.team_id) then
    raise exception 'Inbox item not found' using errcode = 'P0002';
  end if;
  if private.team_access(it.team_id) <> 'full' then
    raise exception 'Your company''s plan is read-only, so new expenses can''t be added' using errcode = '42501';
  end if;
  if it.status = 'approved' then
    raise exception 'This item has already been approved' using errcode = '23505';
  end if;

  begin
    v_amount := round((p_fields->>'amount')::numeric, 2);
    v_vat := round(nullif(p_fields->>'vat_amount', '')::numeric, 2);
    v_date := coalesce(nullif(p_fields->>'expense_date', '')::date, (it.received_at at time zone 'Africa/Johannesburg')::date);
    v_zar := round(nullif(p_fields->>'amount_zar', '')::numeric, 2);
  exception when others then
    raise exception 'Check the amount, VAT and date' using errcode = '22023';
  end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter the amount before approving' using errcode = '22023';
  end if;
  if v_vat is not null and (v_vat < 0 or v_vat > v_amount) then
    raise exception 'The VAT can''t be more than the amount' using errcode = '22023';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter code, like ZAR' using errcode = '22023';
  end if;
  if v_currency = 'ZAR' then v_zar := v_amount; end if;
  if nullif(p_fields->>'job_id', '') is not null and not exists (
       select 1 from public.jobs where id::text = p_fields->>'job_id' and team_id = it.team_id) then
    raise exception 'That job isn''t in your company' using errcode = '42501';
  end if;
  if nullif(p_fields->>'client_id', '') is not null and not exists (
       select 1 from public.clients where id::text = p_fields->>'client_id' and team_id = it.team_id) then
    raise exception 'That customer isn''t in your company' using errcode = '42501';
  end if;

  insert into public.expenses (
    id, user_id, team_id, vendor, vat_number, amount, vat_amount, currency,
    amount_zar, exchange_rate, rate_date, rate_source,
    expense_date, category, payment_method, notes, receipt_url, gl_code,
    status, ai_extracted, sync_status, job_id, client_id, created_at, updated_at
  ) values (
    gen_random_uuid(), auth.uid(), it.team_id,
    left(nullif(trim(p_fields->>'vendor'), ''), 200),
    left(coalesce(trim(p_fields->>'vat_number'), ''), 30),
    v_amount, v_vat, v_currency,
    v_zar,
    case when v_zar is not null and v_amount > 0 then round(v_zar / v_amount, 6) end,
    case when v_zar is not null then current_date end,
    case when v_currency = 'ZAR' then 'ZAR' when v_zar is not null then left(coalesce(p_fields->>'rate_source', 'Manual entry'), 60) end,
    v_date,
    left(coalesce(nullif(trim(p_fields->>'category'), ''), 'Other'), 60),
    left(coalesce(nullif(trim(p_fields->>'payment_method'), ''), 'Card'), 30),
    left(nullif(trim(p_fields->>'notes'), ''), 2000),
    it.file_path,
    left(nullif(trim(p_fields->>'gl_code'), ''), 30),
    'unsubmitted', true, 'synced',
    nullif(p_fields->>'job_id', '')::uuid,
    nullif(p_fields->>'client_id', '')::uuid,
    now(), now()
  ) returning * into e;

  update public.inbox_items
     set status = 'approved', expense_id = e.id, reviewed_by = auth.uid(), reviewed_at = now(), error = null
   where id = it.id;
  return e;
end $$;

-- Reject (not a receipt, spam, a duplicate) or put back in the inbox.
create or replace function public.review_inbox_item(p_id uuid, p_action text)
returns public.inbox_items language plpgsql security definer set search_path = '' as $$
declare it public.inbox_items;
begin
  select * into it from public.inbox_items where id = p_id for update;
  if not found or not private.same_team(it.team_id) then
    raise exception 'Inbox item not found' using errcode = 'P0002';
  end if;
  if it.status = 'approved' then
    raise exception 'This item is already an expense; change or delete the expense instead' using errcode = '42501';
  end if;
  if p_action = 'reject' then
    update public.inbox_items set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id returning * into it;
  elsif p_action = 'restore' then
    update public.inbox_items
       set status = case when extracted = '{}'::jsonb then 'failed' else 'ready' end,
           reviewed_by = null, reviewed_at = null
     where id = p_id returning * into it;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  return it;
end $$;

revoke execute on function public.approve_inbox_item(uuid, jsonb) from public, anon;
revoke execute on function public.review_inbox_item(uuid, text) from public, anon;
grant execute on function public.approve_inbox_item(uuid, jsonb) to authenticated;
grant execute on function public.review_inbox_item(uuid, text) to authenticated;

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['inbox_items','credit_notes','tech_locations','form_submissions','form_templates','customer_messages','purchase_orders','suppliers',
               'reminder_log','client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment','quotes',
               'contacts','expenses','vehicle_checks','custom_faults','company_documents','machine_jack_confirmations',
               'team_notifications','billing_payments','clients']::text[];
$$;
-- Inbox items belong to the company, not a person, so the isolation test
-- checks them by company alongside teams and profiles.
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('inbox_items' in d) = 0 then
    d := replace(d,
      E'  select count(*) into n from public.team_profiles where team_id <> b_team;',
      E'  select count(*) into n from public.inbox_items where team_id <> b_team;\n'
      || E'  if n > 0 then failed := failed + 1; out := out || E''\\nFAIL B sees other companies'''' inbox''; end if;\n'
      || E'  select count(*) into n from public.team_profiles where team_id <> b_team;');
    d := replace(d, 'array_length(tables, 1) + 5)', 'array_length(tables, 1) + 6)');
    if position('inbox_items' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
