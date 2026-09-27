-- ── Financial controls (to the standard of Sage and Xero) ────────────────────
-- * An invoice is a draft until it is approved. A draft can be edited or
--   deleted. Once approved its customer, date, lines and amounts are locked:
--   mistakes are fixed with a credit note, or by voiding it (the number stays
--   used, so the sequence has no gaps).
-- * Payments can't be changed or deleted; a wrong payment is reversed (kept,
--   marked reversed, and no longer counted).
-- * The server works out what's paid, credited and still owed, and the
--   status, from the payments and credit notes. A payment larger than what's
--   owed is refused (except one already received online through PayFast).
-- * The server works out a document's subtotal, VAT and total from its lines:
--   each line can have a discount and its own VAT (standard 15%, zero-rated
--   or exempt).
-- * Credit notes have their own number sequence (CN-00001) and reduce the
--   invoice they belong to.
-- Only the platform's own clean-up (deleting a company on request) bypasses
-- these rules, by setting pm.finance_bypass for its transaction.

-- ── Columns ──
alter table public.invoices
  add column if not exists vat_inclusive boolean not null default false,
  add column if not exists amount_credited numeric not null default 0,
  add column if not exists reference text check (length(reference) <= 100),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text check (length(void_reason) <= 300);
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check
  check (status = any (array['draft','sent','part_paid','paid','credited','overdue','cancelled']));

alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text check (length(void_reason) <= 300);

alter table public.team_profiles
  add column if not exists credit_prefix text not null default 'CN-' check (credit_prefix ~ '^[A-Za-z0-9/_-]{0,12}$'),
  add column if not exists next_credit_number int not null default 1 check (next_credit_number between 1 and 99999999);

-- ── Totals from lines ──
-- Each line: qty × unit price, less its discount %, rounded to the cent; VAT
-- per line at its own rate (standard 15%, zero-rated or exempt 0%). Prices
-- are VAT-inclusive or exclusive for the whole document. Mirrors
-- src/lib/lineTotals.js.
create or replace function private.line_totals(p_lines jsonb, p_inclusive boolean, p_vat_on boolean,
                                               out subtotal numeric, out vat numeric, out total numeric)
language sql immutable set search_path = '' as $$
  with l as (
    select case when x ->> 'qty' ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(x ->> 'qty')::numeric else 1 end as qty,
           case when x ->> 'unitPrice' ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(x ->> 'unitPrice')::numeric else 0 end as price,
           case when x ->> 'discount' ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then least(trim(x ->> 'discount')::numeric, 100) else 0 end as disc,
           case when not p_vat_on or coalesce(x ->> 'vat', 'standard') in ('zero', 'exempt') then 0 else 0.15 end as rate
      from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) x
     where jsonb_typeof(x) = 'object'),
  a as (select round(qty * price * (1 - disc / 100), 2) as amt, rate from l),
  v as (select amt, case when p_inclusive then round(amt * rate / (1 + rate), 2) else round(amt * rate, 2) end as vat from a)
  select coalesce(sum(case when p_inclusive then amt - vat else amt end), 0),
         coalesce(sum(vat), 0),
         coalesce(sum(case when p_inclusive then amt else amt + vat end), 0)
    from v;
$$;
revoke execute on function private.line_totals(jsonb, boolean, boolean) from public, anon;
grant execute on function private.line_totals(jsonb, boolean, boolean) to authenticated;

create or replace function private.vat_on(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select vat_registered from public.team_profiles where team_id = p_team_id), true);
$$;
revoke execute on function private.vat_on(uuid) from public, anon, authenticated;

create or replace function private.finance_bypass() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('pm.finance_bypass', true), '') = 'on';
$$;

-- ── Credit notes ──
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  credit_number text not null,
  issue_date date not null default current_date,
  reason text not null check (length(trim(reason)) between 1 and 500),
  line_items jsonb not null default '[]'::jsonb,
  vat_inclusive boolean not null default true,
  subtotal numeric not null,
  vat numeric not null,
  total numeric not null check (total > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists credit_notes_number_uidx on public.credit_notes (team_id, credit_number);
create index if not exists credit_notes_invoice_idx on public.credit_notes (invoice_id);
alter table public.credit_notes enable row level security;
drop policy if exists credit_notes_select on public.credit_notes;
drop policy if exists credit_notes_plan_read on public.credit_notes;
create policy credit_notes_select on public.credit_notes for select to authenticated
  using (private.same_team(team_id));
create policy credit_notes_plan_read on public.credit_notes as restrictive for select to authenticated
  using (private.team_access(team_id) <> 'suspended');
revoke all on public.credit_notes from anon, authenticated;
grant select on public.credit_notes to authenticated;
-- Nobody edits or deletes a credit note; they are made by create_credit_note().
drop trigger if exists audit_credit_notes on public.credit_notes;
create trigger audit_credit_notes after insert or update or delete on public.credit_notes
  for each row execute function private.audit_row();

-- ── Invoices ──
create or replace function private.invoice_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_paid numeric := 0;
  v_credited numeric := 0;
  v_balance numeric;
  v_voiding boolean := coalesce(current_setting('pm.finance_void', true), '') = 'on';
  t record;
begin
  if private.finance_bypass() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft'
       or exists (select 1 from public.payments where invoice_id = old.id and voided_at is null)
       or exists (select 1 from public.credit_notes where invoice_id = old.id) then
      raise exception 'Invoice % is approved, so it can''t be deleted. Void it or issue a credit note instead.',
        coalesce(old.invoice_number, '') using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- Quote line items are stored as JSON text by older app versions.
  if jsonb_typeof(new.line_items) = 'string' then
    begin
      new.line_items := (new.line_items #>> '{}')::jsonb;
    exception when others then
      new.line_items := '[]'::jsonb;
    end;
  end if;

  if tg_op = 'UPDATE' and old.status <> 'draft' then
    -- Approved: what the customer was billed can't change.
    if new.line_items is distinct from old.line_items
       or new.subtotal is distinct from old.subtotal
       or new.vat is distinct from old.vat
       or new.total is distinct from old.total
       or new.vat_inclusive is distinct from old.vat_inclusive
       or new.issue_date is distinct from old.issue_date
       or new.team_id is distinct from old.team_id
       or (old.client_id is not null and new.client_id is distinct from old.client_id)
       or (old.quote_id is not null and new.quote_id is distinct from old.quote_id)
       or (old.job_id is not null and new.job_id is distinct from old.job_id) then
      raise exception 'Invoice % is approved, so it can''t be changed. Issue a credit note, or void it and make a new one.',
        coalesce(old.invoice_number, '') using errcode = 'P0001';
    end if;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    -- A voided invoice stays void; an approved one never goes back to draft;
    -- voiding goes through void_invoice().
    if old.status = 'cancelled' then
      new.status := 'cancelled';
    elsif new.status = 'cancelled' and not v_voiding then
      raise exception 'Use Void to cancel an approved invoice.' using errcode = 'P0001';
    elsif new.status = 'draft' then
      new.status := old.status;
    end if;
    if not v_voiding then
      new.voided_at := old.voided_at;
      new.voided_by := old.voided_by;
      new.void_reason := old.void_reason;
    end if;
  else
    -- A draft (or a new invoice): totals come from its lines.
    if jsonb_typeof(new.line_items) = 'array' and jsonb_array_length(new.line_items) > 0 then
      select * into t from private.line_totals(new.line_items, coalesce(new.vat_inclusive, false), private.vat_on(new.team_id));
      new.subtotal := t.subtotal;
      new.vat := t.vat;
      new.total := t.total;
    end if;
    new.subtotal := coalesce(new.subtotal, 0);
    new.vat := coalesce(new.vat, 0);
    new.total := coalesce(new.total, 0);
    new.issue_date := coalesce(new.issue_date, current_date);
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    if new.status = 'cancelled' then
      raise exception 'A draft invoice is deleted, not voided.' using errcode = 'P0001';
    end if;
    if new.status is distinct from 'draft' then
      -- Approving.
      if new.client_id is null and new.sync_pending_client_id is null then
        raise exception 'Choose the customer before approving the invoice.' using errcode = 'P0001';
      end if;
      if new.total <= 0 then
        raise exception 'An invoice needs an amount before it can be approved.' using errcode = 'P0001';
      end if;
      new.approved_at := coalesce(new.approved_at, now());
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.due_date := coalesce(new.due_date, new.issue_date + coalesce(
        (select payment_terms_days from public.team_profiles where team_id = new.team_id), 30));
    else
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;

  -- What's paid, credited and owed, and the status.
  if tg_op = 'UPDATE' then
    select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = new.id and voided_at is null;
    select coalesce(sum(total), 0) into v_credited from public.credit_notes where invoice_id = new.id;
  end if;
  new.amount_paid := v_paid;
  new.amount_credited := v_credited;
  if new.status = 'cancelled' then
    new.balance_due := 0;
  else
    v_balance := new.total - v_paid - v_credited;
    new.balance_due := greatest(v_balance, 0);
    if new.status <> 'draft' then
      new.status := case
        when v_balance <= 0.004 and v_paid > 0 then 'paid'
        when v_balance <= 0.004 then 'credited'
        when v_paid > 0 or v_credited > 0 then 'part_paid'
        else 'sent' end;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.invoice_controls() from public, anon, authenticated;

drop trigger if exists invoices_financial_controls on public.invoices;
create trigger invoices_financial_controls before insert or update or delete on public.invoices
  for each row execute function private.invoice_controls();

-- Paid/owed are recalculated by invoice_controls(); touching the row is enough.
create or replace function public.recalculate_invoice_payment_totals(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = 'public' as $$
begin
  update public.invoices set updated_at = now() where id = p_invoice_id;
end $$;

-- ── Payments ──
create or replace function private.payment_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  v_owed numeric;
  v_attaching boolean;
begin
  if private.finance_bypass() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'A payment can''t be deleted. Reverse it instead.' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.amount is distinct from old.amount
       or new.payment_date is distinct from old.payment_date
       or new.method is distinct from old.method
       or new.team_id is distinct from old.team_id
       or (old.invoice_id is not null and new.invoice_id is distinct from old.invoice_id) then
      raise exception 'A payment can''t be changed. Reverse it and record the right one.' using errcode = 'P0001';
    end if;
    if coalesce(current_setting('pm.finance_void', true), '') <> 'on' or old.voided_at is not null then
      new.voided_at := old.voided_at;
      new.voided_by := old.voided_by;
      new.void_reason := old.void_reason;
    end if;
  else
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    -- A retry of a payment that's already recorded: let the unique index say so.
    if exists (select 1 from public.payments where id = new.id)
       or (new.idempotency_key is not null and exists (select 1 from public.payments where idempotency_key = new.idempotency_key)) then
      return new;
    end if;
  end if;

  -- Checks when a payment is first attached to its invoice (on insert, or
  -- when an offline payment reaches the server after its invoice).
  v_attaching := new.invoice_id is not null and (tg_op = 'INSERT' or old.invoice_id is null);
  if v_attaching then
    select * into i from public.invoices where id = new.invoice_id for update;
    if found then
      if i.status = 'cancelled' then
        raise exception 'Invoice % is void; a payment can''t be recorded against it.', coalesce(i.invoice_number, '')
          using errcode = 'P0001';
      end if;
      if i.status = 'draft' then
        -- Paying a draft approves it.
        update public.invoices set status = 'sent' where id = i.id;
        select * into i from public.invoices where id = new.invoice_id;
      end if;
      select i.total - coalesce((select sum(amount) from public.payments where invoice_id = i.id and voided_at is null), 0)
                     - coalesce((select sum(total) from public.credit_notes where invoice_id = i.id), 0)
        into v_owed;
      -- Money already received online is always recorded.
      if new.amount > v_owed + 0.004 and coalesce(new.idempotency_key, '') not like 'payfast:%' then
        raise exception 'The payment (R %) is more than the R % still owed on invoice %.',
          to_char(new.amount, 'FM999999990.00'), to_char(greatest(v_owed, 0), 'FM999999990.00'), coalesce(i.invoice_number, '')
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.payment_controls() from public, anon, authenticated;

drop trigger if exists payments_financial_controls on public.payments;
create trigger payments_financial_controls before insert or update or delete on public.payments
  for each row execute function private.payment_controls();

-- ── Actions: void an invoice, reverse a payment, issue a credit note ──
create or replace function private.require_finance_manager(p_team_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_team_id is null or not (private.same_team(p_team_id) and private.is_team_manager(p_team_id)) then
    raise exception 'Only the master account or an admin can do this' using errcode = '42501';
  end if;
  if private.team_access(p_team_id) <> 'full' then
    raise exception 'Your plan is read-only at the moment' using errcode = '42501';
  end if;
end $$;
revoke execute on function private.require_finance_manager(uuid) from public, anon, authenticated;

create or replace function private.void_invoice(p_invoice_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  perform private.require_finance_manager(i.team_id);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Give a reason for voiding the invoice' using errcode = 'P0001'; end if;
  if i.status = 'draft' then raise exception 'A draft invoice is deleted, not voided.' using errcode = 'P0001'; end if;
  if i.status = 'cancelled' then return jsonb_build_object('ok', true); end if;
  if exists (select 1 from public.payments where invoice_id = i.id and voided_at is null) then
    raise exception 'Invoice % has payments. Reverse them first, or issue a credit note.', i.invoice_number using errcode = 'P0001';
  end if;
  if exists (select 1 from public.credit_notes where invoice_id = i.id) then
    raise exception 'Invoice % has a credit note. Credit the rest instead of voiding it.', i.invoice_number using errcode = 'P0001';
  end if;
  perform set_config('pm.finance_void', 'on', true);
  update public.invoices
     set status = 'cancelled', voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 300)
   where id = i.id;
  perform set_config('pm.finance_void', '', true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.void_payment(p_payment_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  perform private.require_finance_manager(p.team_id);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Give a reason for reversing the payment' using errcode = 'P0001'; end if;
  if p.voided_at is not null then return jsonb_build_object('ok', true); end if;
  perform set_config('pm.finance_void', 'on', true);
  update public.payments set voided_at = now(), voided_by = auth.uid(), void_reason = left(trim(p_reason), 300)
   where id = p.id;
  perform set_config('pm.finance_void', '', true);
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.create_credit_note(p_invoice_id uuid, p_amount numeric, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  v_owed numeric;
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_lines jsonb;
  v_incl boolean := true;
  v_std numeric;
  v_std_share numeric;
  t record;
  v_prefix text;
  v_next int;
  v_number text;
  v_id uuid;
begin
  select * into i from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  perform private.require_finance_manager(i.team_id);
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Give the reason for the credit note' using errcode = 'P0001'; end if;
  if i.status in ('draft', 'cancelled') then
    raise exception 'A credit note is only for an approved invoice.' using errcode = 'P0001';
  end if;
  v_owed := i.total - coalesce((select sum(amount) from public.payments where invoice_id = i.id and voided_at is null), 0)
                    - coalesce((select sum(total) from public.credit_notes where invoice_id = i.id), 0);
  if v_amount <= 0 then raise exception 'Enter the amount to credit' using errcode = 'P0001'; end if;
  if v_amount > v_owed + 0.004 then
    raise exception 'You can credit at most the R % still owed on invoice %.', to_char(greatest(v_owed, 0), 'FM999999990.00'), i.invoice_number
      using errcode = 'P0001';
  end if;

  if v_amount = i.total and jsonb_typeof(i.line_items) = 'array' and jsonb_array_length(i.line_items) > 0 then
    -- The whole invoice: the same lines.
    v_lines := i.line_items;
    v_incl := i.vat_inclusive;
  else
    -- Part of it: one line, split between VAT at 15% and 0% in the same
    -- proportion as the invoice.
    v_std := coalesce((select sum(case when coalesce(x ->> 'vat', 'standard') in ('zero', 'exempt') then 0 else 1 end)
                         from jsonb_array_elements(case when jsonb_typeof(i.line_items) = 'array' then i.line_items else '[]'::jsonb end) x), 0);
    if not private.vat_on(i.team_id) or i.vat = 0 then
      v_std_share := 0;
    elsif v_std = 0 or i.total = 0 or (jsonb_typeof(i.line_items) = 'array' and v_std = jsonb_array_length(i.line_items))
          or jsonb_typeof(i.line_items) <> 'array' or jsonb_array_length(i.line_items) = 0 then
      v_std_share := 1;
    else
      -- VAT-inclusive value of the standard-rated part of the invoice.
      v_std_share := least(1, round(i.vat / 0.15 * 1.15, 2) / i.total);
    end if;
    v_lines := '[]'::jsonb;
    if round(v_amount * v_std_share, 2) > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', 'Credit: ' || left(trim(p_reason), 200),
        'qty', 1, 'unitPrice', round(v_amount * v_std_share, 2), 'vat', 'standard'));
    end if;
    if v_amount - round(v_amount * v_std_share, 2) > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('description', 'Credit: ' || left(trim(p_reason), 200),
        'qty', 1, 'unitPrice', v_amount - round(v_amount * v_std_share, 2), 'vat', 'zero'));
    end if;
    v_incl := true;
  end if;
  select * into t from private.line_totals(v_lines, v_incl, private.vat_on(i.team_id));
  if t.total > v_owed + 0.004 then
    raise exception 'You can credit at most the R % still owed on invoice %.', to_char(greatest(v_owed, 0), 'FM999999990.00'), i.invoice_number
      using errcode = 'P0001';
  end if;

  insert into public.team_profiles (team_id) values (i.team_id) on conflict (team_id) do nothing;
  loop
    update public.team_profiles set next_credit_number = next_credit_number + 1 where team_id = i.team_id
    returning credit_prefix, next_credit_number - 1 into v_prefix, v_next;
    v_number := v_prefix || lpad(v_next::text, 5, '0');
    exit when not exists (select 1 from public.credit_notes where team_id = i.team_id and credit_number = v_number);
  end loop;

  insert into public.credit_notes (team_id, user_id, invoice_id, client_id, credit_number, reason, line_items, vat_inclusive,
                                   subtotal, vat, total)
  values (i.team_id, auth.uid(), i.id, i.client_id, v_number, left(trim(p_reason), 500), v_lines, v_incl, t.subtotal, t.vat, t.total)
  returning id into v_id;
  update public.invoices set updated_at = now() where id = i.id;
  return jsonb_build_object('ok', true, 'id', v_id, 'credit_number', v_number, 'total', t.total);
end $$;

revoke execute on function private.void_invoice(uuid, text) from public, anon;
revoke execute on function private.void_payment(uuid, text) from public, anon;
revoke execute on function private.create_credit_note(uuid, numeric, text) from public, anon;
grant execute on function private.void_invoice(uuid, text) to authenticated;
grant execute on function private.void_payment(uuid, text) to authenticated;
grant execute on function private.create_credit_note(uuid, numeric, text) to authenticated;

create or replace function public.void_invoice(p_invoice_id uuid, p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.void_invoice(p_invoice_id, p_reason); $$;
create or replace function public.void_payment(p_payment_id uuid, p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.void_payment(p_payment_id, p_reason); $$;
create or replace function public.create_credit_note(p_invoice_id uuid, p_amount numeric, p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.create_credit_note(p_invoice_id, p_amount, p_reason); $$;
revoke execute on function public.void_invoice(uuid, text) from public, anon;
revoke execute on function public.void_payment(uuid, text) from public, anon;
revoke execute on function public.create_credit_note(uuid, numeric, text) from public, anon;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.create_credit_note(uuid, numeric, text) to authenticated;

-- ── Deleting a company on request removes its records regardless ──
do $$
declare d text;
begin
  d := pg_get_functiondef('private.admin_delete_company(uuid, text)'::regprocedure);
  if position('pm.finance_bypass' in d) = 0 then
    d := replace(d, 'foreach t in array private.company_tables() loop',
                 'perform set_config(''pm.finance_bypass'', ''on'', true);' || chr(10) || '  foreach t in array private.company_tables() loop');
    if position('pm.finance_bypass' in d) = 0 then raise exception 'admin_delete_company patch did not apply'; end if;
    execute d;
  end if;
end $$;

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['credit_notes','tech_locations','form_submissions','form_templates','customer_messages','purchase_orders','suppliers',
               'reminder_log','client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment','quotes',
               'contacts','expenses','vehicle_checks','custom_faults','company_documents','machine_jack_confirmations',
               'team_notifications','billing_payments','clients']::text[];
$$;
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''credit_notes''' in d) = 0 then
    d := replace(d, '''tech_locations''];', '''tech_locations'',''credit_notes''];');
    if position('''credit_notes''' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
