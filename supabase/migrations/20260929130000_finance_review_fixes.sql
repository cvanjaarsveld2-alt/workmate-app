-- ── Fixes from the review of the financial controls ──────────────────────────
-- 1. Deleting a job or quote linked to an approved invoice clears the link
--    (the database does that) instead of failing. A customer with approved
--    invoices or accepted quotes can't be deleted, with a clear message; their
--    records are the company's books.
-- 2. Deleting a person's login keeps the invoices and payments they recorded
--    (the link to them is cleared): financial records are kept.
-- 3. Voiding an invoice frees its job, so the job can be invoiced again.
-- 4. Line totals read the same line formats the app does
--    (qty/quantity, unitPrice/unit_price/price).
-- 5. Someone using the app without a company can correct their own invoices.
-- 6. A job always points at the latest version of its quote.

-- 1 + 3 + 5: patched functions (checked, so a mismatch fails loudly).
do $$
declare d text;
begin
  d := pg_get_functiondef('private.invoice_controls()'::regprocedure);
  d := replace(d, '(old.quote_id is not null and new.quote_id is distinct from old.quote_id)',
                  '(old.quote_id is not null and new.quote_id is not null and new.quote_id is distinct from old.quote_id)');
  d := replace(d, '(old.job_id is not null and new.job_id is distinct from old.job_id)',
                  '(old.job_id is not null and new.job_id is not null and new.job_id is distinct from old.job_id)');
  if position('new.quote_id is not null and new.quote_id is distinct' in d) = 0
     or position('new.job_id is not null and new.job_id is distinct' in d) = 0 then
    raise exception 'invoice_controls patch did not apply';
  end if;
  execute d;

  d := pg_get_functiondef('private.void_invoice(uuid, text)'::regprocedure);
  d := replace(d, 'set status = ''cancelled'', voided_at = now()', 'set status = ''cancelled'', job_id = null, voided_at = now()');
  d := replace(d, 'perform private.require_finance_manager(i.team_id);', 'perform private.require_finance_manager(i.team_id, i.user_id);');
  if position('job_id = null' in d) = 0 or position('require_finance_manager(i.team_id, i.user_id)' in d) = 0 then
    raise exception 'void_invoice patch did not apply';
  end if;
  execute d;

  d := pg_get_functiondef('private.create_credit_note(uuid, numeric, text)'::regprocedure);
  d := replace(d, 'perform private.require_finance_manager(i.team_id);', 'perform private.require_finance_manager(i.team_id, i.user_id);');
  if position('require_finance_manager(i.team_id, i.user_id)' in d) = 0 then raise exception 'create_credit_note patch did not apply'; end if;
  execute d;

  d := pg_get_functiondef('private.void_payment(uuid, text)'::regprocedure);
  d := replace(d, 'perform private.require_finance_manager(p.team_id);', 'perform private.require_finance_manager(p.team_id, p.user_id);');
  if position('require_finance_manager(p.team_id, p.user_id)' in d) = 0 then raise exception 'void_payment patch did not apply'; end if;
  execute d;
end $$;

-- 5: with a company, its master account or an admin; without one, the owner.
create or replace function private.require_finance_manager(p_team_id uuid, p_owner uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_team_id is null then
    if p_owner is null or p_owner <> auth.uid() then
      raise exception 'Only the master account or an admin can do this' using errcode = '42501';
    end if;
    return;
  end if;
  perform private.require_finance_manager(p_team_id);
end $$;
revoke execute on function private.require_finance_manager(uuid, uuid) from public, anon, authenticated;

-- Invoices voided before this fix free their jobs too.
do $$
begin
  perform set_config('pm.finance_bypass', 'on', true);
  update public.invoices set job_id = null where status = 'cancelled' and job_id is not null;
  perform set_config('pm.finance_bypass', '', true);
end $$;

-- 1: customers with books can't be deleted.
create or replace function private.client_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.finance_bypass() then return old; end if;
  if exists (select 1 from public.invoices where client_id = old.id and status <> 'draft')
     or exists (select 1 from public.quotes where client_id = old.id
                  and (status in ('Accepted', 'Superseded') or invoiced_at is not null)) then
    raise exception '% has approved invoices or accepted quotes, so it can''t be deleted. Those records are part of your books.',
      coalesce(old.company, 'This customer') using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke execute on function private.client_delete_guard() from public, anon, authenticated;
drop trigger if exists clients_delete_guard on public.clients;
create trigger clients_delete_guard before delete on public.clients
  for each row execute function private.client_delete_guard();

-- 2: financial records outlive the login that made them.
alter table public.invoices alter column user_id drop not null;
alter table public.payments alter column user_id drop not null;
alter table public.invoices drop constraint if exists invoices_user_id_fkey;
alter table public.invoices add constraint invoices_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
alter table public.payments drop constraint if exists payments_user_id_fkey;
alter table public.payments add constraint payments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- 4: the same line formats as the app.
create or replace function private.line_totals(p_lines jsonb, p_inclusive boolean, p_vat_on boolean,
                                               out subtotal numeric, out vat numeric, out total numeric)
language sql immutable set search_path = '' as $$
  with l as (
    select coalesce(x ->> 'qty', x ->> 'quantity') as q,
           coalesce(x ->> 'unitPrice', x ->> 'unit_price', x ->> 'price') as p,
           x ->> 'discount' as d,
           case when not p_vat_on or coalesce(x ->> 'vat', 'standard') in ('zero', 'exempt') then 0 else 0.15 end as rate
      from jsonb_array_elements(case when jsonb_typeof(p_lines) = 'array' then p_lines else '[]'::jsonb end) x
     where jsonb_typeof(x) = 'object'),
  n as (
    select case when q ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(q)::numeric else 1 end as qty,
           case when p ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then trim(p)::numeric else 0 end as price,
           case when d ~ '^\s*[0-9]+(\.[0-9]+)?\s*$' then least(trim(d)::numeric, 100) else 0 end as disc,
           rate
      from l),
  a as (select round(qty * price * (1 - disc / 100), 2) as amt, rate from n),
  v as (select amt, case when p_inclusive then round(amt * rate / (1 + rate), 2) else round(amt * rate, 2) end as vat from a)
  select coalesce(sum(case when p_inclusive then amt - vat else amt end), 0),
         coalesce(sum(vat), 0),
         coalesce(sum(case when p_inclusive then amt else amt + vat end), 0)
    from v;
$$;

-- 6: a job made from a quote follows it to its newest version.
create or replace function private.job_latest_quote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_next uuid;
  n int := 0;
begin
  if new.quote_id is null then return new; end if;
  loop
    select superseded_by into v_next from public.quotes where id = new.quote_id;
    exit when v_next is null or n > 20;
    new.quote_id := v_next;
    n := n + 1;
  end loop;
  return new;
end $$;
revoke execute on function private.job_latest_quote() from public, anon, authenticated;
drop trigger if exists jobs_latest_quote on public.jobs;
create trigger jobs_latest_quote before insert or update of quote_id on public.jobs
  for each row execute function private.job_latest_quote();
