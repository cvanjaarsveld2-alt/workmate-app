-- ── Quotes: locked once accepted, revisions, expiry, invoiced ────────────────
-- * An accepted quote (and one that's been invoiced, or replaced by a
--   revision) can't be changed or deleted: its customer, lines, amounts,
--   write-up and terms are what the customer agreed to. To change it, Revise
--   makes a new version (Q-00012-R1) and marks the old one Superseded; the
--   job made from it moves to the new version.
-- * A quote the customer signed online stays accepted. One marked accepted by
--   hand can be set back (a mistake), until it's invoiced.
-- * Every quote gets an expiry date (the company's validity period) and a
--   pending quote past it is marked Expired every night.
-- * invoiced_at is set when an invoice made from the quote is approved (and
--   cleared if that invoice is voided).

alter table public.quotes
  add column if not exists invoiced_at timestamptz,
  add column if not exists revision int not null default 0 check (revision between 0 and 99),
  add column if not exists revision_of uuid references public.quotes(id) on delete set null,
  add column if not exists superseded_by uuid references public.quotes(id) on delete set null;

create or replace function private.quote_controls() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_system boolean := coalesce(current_setting('pm.quote_system', true), '') = 'on';
  v_locked boolean;
begin
  if private.finance_bypass() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    new.invoiced_at := null;
    new.superseded_by := null;
    if new.expiry_date is null then
      new.expiry_date := coalesce(new.sent_date, current_date) + coalesce(
        (select quote_validity_days from public.team_profiles where team_id = new.team_id), 30);
    end if;
    return new;
  end if;

  v_locked := old.status in ('Accepted', 'Superseded') or old.invoiced_at is not null;

  if tg_op = 'DELETE' then
    if v_locked then
      raise exception 'Quote % has been accepted, so it can''t be deleted.', coalesce(old.quote_number, '') using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- Only the server sets these.
  if not v_system then
    new.invoiced_at := old.invoiced_at;
    new.superseded_by := old.superseded_by;
    new.revision := old.revision;
    new.revision_of := old.revision_of;
  end if;
  -- What the customer signed stays.
  if old.accepted_at is not null then
    new.accepted_at := old.accepted_at;
    new.accepted_by_name := old.accepted_by_name;
    new.accepted_signature := old.accepted_signature;
    new.accepted_po := old.accepted_po;
  end if;

  if v_locked and not v_system then
    if new.line_items is distinct from old.line_items
       or new.value is distinct from old.value
       or new.vat_inclusive is distinct from old.vat_inclusive
       or new.description is distinct from old.description
       or new.details is distinct from old.details
       or new.team_id is distinct from old.team_id
       or (old.client_id is not null and new.client_id is distinct from old.client_id) then
      raise exception 'Quote % has been accepted, so it can''t be changed. Use Revise to make a new version.',
        coalesce(old.quote_number, '') using errcode = 'P0001';
    end if;
    if old.status = 'Superseded' then
      new.status := 'Superseded';
    elsif new.status is distinct from old.status
          and (old.accepted_at is not null or old.invoiced_at is not null) then
      new.status := old.status;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.quote_controls() from public, anon, authenticated;

drop trigger if exists quotes_controls on public.quotes;
create trigger quotes_controls before insert or update or delete on public.quotes
  for each row execute function private.quote_controls();

-- Existing quotes get an expiry date.
update public.quotes q
   set expiry_date = coalesce(q.sent_date, q.created_at::date, current_date)
                     + coalesce((select quote_validity_days from public.team_profiles p where p.team_id = q.team_id), 30)
 where q.expiry_date is null;

-- ── Invoiced: set when an invoice made from the quote is approved ──
create or replace function private.mark_quote_invoiced() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.quote_id is null then return new; end if;
  perform set_config('pm.quote_system', 'on', true);
  if new.status not in ('draft', 'cancelled') then
    update public.quotes set invoiced_at = coalesce(invoiced_at, now()) where id = new.quote_id and invoiced_at is null;
  elsif new.status = 'cancelled' and not exists (
      select 1 from public.invoices where quote_id = new.quote_id and id <> new.id and status not in ('draft', 'cancelled')) then
    update public.quotes set invoiced_at = null where id = new.quote_id and invoiced_at is not null;
  end if;
  perform set_config('pm.quote_system', '', true);
  return new;
end $$;
revoke execute on function private.mark_quote_invoiced() from public, anon, authenticated;
drop trigger if exists invoices_mark_quote on public.invoices;
create trigger invoices_mark_quote after insert or update of status, quote_id on public.invoices
  for each row execute function private.mark_quote_invoiced();

update public.quotes q set invoiced_at = (
    select min(coalesce(i.approved_at, i.created_at)) from public.invoices i
     where i.quote_id = q.id and i.status not in ('draft', 'cancelled'))
 where q.invoiced_at is null
   and exists (select 1 from public.invoices i where i.quote_id = q.id and i.status not in ('draft', 'cancelled'));

-- A revision keeps the number it was given (Q-00012-R1).
create or replace function private.assign_quote_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_next int;
  v_number text;
begin
  if tg_op = 'UPDATE' then
    new.quote_number := coalesce(old.quote_number, new.quote_number);
    return new;
  end if;
  if coalesce(current_setting('pm.quote_system', true), '') = 'on' and new.quote_number is not null then
    return new;
  end if;
  if new.team_id is null or exists (select 1 from public.quotes where id = new.id) then
    return new;
  end if;
  insert into public.team_profiles (team_id) values (new.team_id) on conflict (team_id) do nothing;
  loop
    update public.team_profiles
       set next_quote_number = next_quote_number + 1
     where team_id = new.team_id
    returning quote_prefix, next_quote_number - 1 into v_prefix, v_next;
    v_number := v_prefix || lpad(v_next::text, 5, '0');
    exit when not exists (
      select 1 from public.quotes where team_id = new.team_id and quote_number = v_number);
  end loop;
  new.quote_number := v_number;
  return new;
end $$;

-- ── Revise: a new version of a quote ──
create or replace function private.revise_quote(p_quote_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes;
  v_root uuid;
  v_base text;
  v_rev int;
  v_id uuid := gen_random_uuid();
  v_number text;
begin
  select * into q from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found'; end if;
  if not (q.user_id = auth.uid() or q.assigned_to_user_id = auth.uid() or (q.team_id is not null and private.can_see_team(q.team_id))) then
    raise exception 'Quote not found';
  end if;
  if q.team_id is not null and private.team_access(q.team_id) <> 'full' then
    raise exception 'Your plan is read-only at the moment' using errcode = '42501';
  end if;
  if q.status = 'Superseded' then raise exception 'This quote has already been revised.' using errcode = 'P0001'; end if;
  if q.invoiced_at is not null then
    raise exception 'Quote % has been invoiced. Make a new quote for further work.', coalesce(q.quote_number, '') using errcode = 'P0001';
  end if;
  v_root := coalesce(q.revision_of, q.id);
  v_rev := coalesce((select max(revision) from public.quotes where id = v_root or revision_of = v_root), 0) + 1;
  v_base := regexp_replace(coalesce(q.quote_number, upper(left(replace(q.id::text, '-', ''), 8))), '-R[0-9]+$', '');
  v_number := v_base || '-R' || v_rev;

  perform set_config('pm.quote_system', 'on', true);
  insert into public.quotes (id, user_id, team_id, client_id, client_name, quote_number, description, value, status, sent_date,
                             follow_up_date, notes, job_card_number, line_items, vat_inclusive, assigned_to_user_id, details,
                             source, track, client_confirmed, revision, revision_of, sync_status, created_at, updated_at)
  values (v_id, auth.uid(), q.team_id, q.client_id, q.client_name, v_number, q.description, q.value, 'Pending', current_date,
          q.follow_up_date, q.notes, q.job_card_number, q.line_items, q.vat_inclusive, q.assigned_to_user_id, q.details,
          coalesce(q.source, 'manual'), q.track, q.client_confirmed, v_rev, v_root, 'synced', now(), now());
  update public.quotes
     set status = 'Superseded', superseded_by = v_id, share_token = null, share_expires_at = null, updated_at = now()
   where id = q.id;
  -- The job made from the old version belongs to the new one.
  update public.jobs set quote_id = v_id where quote_id = q.id;
  perform set_config('pm.quote_system', '', true);
  return jsonb_build_object('ok', true, 'id', v_id, 'quote_number', v_number);
end $$;
revoke execute on function private.revise_quote(uuid) from public, anon;
grant execute on function private.revise_quote(uuid) to authenticated;
create or replace function public.revise_quote(p_quote_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.revise_quote(p_quote_id); $$;
revoke execute on function public.revise_quote(uuid) from public, anon;
grant execute on function public.revise_quote(uuid) to authenticated;

-- ── Pending quotes past their expiry date are marked Expired (00:20 UTC) ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-quote-expiry') then
    perform cron.unschedule('powermate-quote-expiry');
  end if;
  perform cron.schedule('powermate-quote-expiry', '20 0 * * *',
    $cmd$ update public.quotes set status = 'Expired', updated_at = now()
           where status = 'Pending' and expiry_date < current_date and accepted_at is null $cmd$);
end $$;
