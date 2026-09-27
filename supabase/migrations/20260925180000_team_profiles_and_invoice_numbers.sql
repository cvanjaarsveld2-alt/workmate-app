-- ── Company profile per team, and sequential invoice numbers ─────────────────
-- Each company (team) has one profile used on every quote, pro forma and
-- invoice PDF: its own logo, registered details, bank details and terms.
-- Everyone in the team can read it; only the team's master account (owner)
-- can change it. The logo is stored inline as a small compressed data URL so
-- documents can be built on the phone with no signal.
create table if not exists public.team_profiles (
  team_id uuid primary key references public.teams(id) on delete cascade,
  trading_name text check (length(trading_name) <= 120),
  legal_name text check (length(legal_name) <= 160),
  registration_no text check (length(registration_no) <= 40),
  vat_no text check (length(vat_no) <= 20),
  address text check (length(address) <= 400),
  phone text check (length(phone) <= 40),
  email text check (length(email) <= 120),
  website text check (length(website) <= 120),
  bank_name text check (length(bank_name) <= 60),
  bank_account_name text check (length(bank_account_name) <= 120),
  bank_account_no text check (length(bank_account_no) <= 30),
  bank_branch_code text check (length(bank_branch_code) <= 20),
  bank_account_type text check (length(bank_account_type) <= 30),
  bank_swift text check (length(bank_swift) <= 15),
  quote_validity_days int not null default 30 check (quote_validity_days between 1 and 365),
  payment_terms_days int not null default 30 check (payment_terms_days between 0 and 365),
  quote_terms text check (length(quote_terms) <= 6000),
  invoice_terms text check (length(invoice_terms) <= 6000),
  invoice_prefix text not null default 'INV-' check (invoice_prefix ~ '^[A-Za-z0-9/_-]{0,12}$'),
  next_invoice_number int not null default 1 check (next_invoice_number between 1 and 99999999),
  brand_color text not null default '#8B1A1A' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_data text check (logo_data is null or (length(logo_data) <= 600000 and logo_data ~ '^data:image/(png|jpeg);base64,')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.team_profiles enable row level security;

drop policy if exists team_profiles_select on public.team_profiles;
create policy team_profiles_select on public.team_profiles for select to authenticated
  using ((select private.same_team(team_id)));
drop policy if exists team_profiles_insert on public.team_profiles;
create policy team_profiles_insert on public.team_profiles for insert to authenticated
  with check ((select private.is_team_owner(team_id)));
drop policy if exists team_profiles_update on public.team_profiles;
create policy team_profiles_update on public.team_profiles for update to authenticated
  using ((select private.is_team_owner(team_id)))
  with check ((select private.is_team_owner(team_id)));
grant select, insert, update on public.team_profiles to authenticated;

create or replace function private.touch_team_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists team_profiles_touch on public.team_profiles;
create trigger team_profiles_touch before insert or update on public.team_profiles
  for each row execute function private.touch_team_profile();

-- Existing teams start with their team name as the trading name.
insert into public.team_profiles (team_id, trading_name)
select id, name from public.teams
on conflict (team_id) do nothing;

-- Customer details a tax invoice over R5 000 must show.
alter table public.clients add column if not exists vat_number text check (length(vat_number) <= 20);
alter table public.clients add column if not exists billing_address text check (length(billing_address) <= 400);

-- ── Sequential invoice numbers ───────────────────────────────────────────────
-- Phones create invoices offline with a temporary number. When the invoice
-- reaches the server it is given the team's next number (prefix + 5 digits,
-- e.g. INV-00042), so numbers never repeat or skip between teammates. A later
-- upsert of the same invoice (e.g. after a payment) keeps that number.
create or replace function private.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_next int;
  v_number text;
begin
  if tg_op = 'UPDATE' then
    new.invoice_number := coalesce(old.invoice_number, new.invoice_number);
    return new;
  end if;
  -- An upsert of an invoice that already exists fires this before turning
  -- into an update: don't spend a number on it.
  if new.team_id is null or exists (select 1 from public.invoices where id = new.id) then
    return new;
  end if;
  insert into public.team_profiles (team_id) values (new.team_id) on conflict (team_id) do nothing;
  loop
    update public.team_profiles
       set next_invoice_number = next_invoice_number + 1
     where team_id = new.team_id
    returning invoice_prefix, next_invoice_number - 1 into v_prefix, v_next;
    v_number := v_prefix || lpad(v_next::text, 5, '0');
    -- The owner may have set the counter back; skip numbers already used.
    exit when not exists (
      select 1 from public.invoices
       where coalesce(team_id, user_id) = new.team_id and invoice_number = v_number);
  end loop;
  new.invoice_number := v_number;
  return new;
end $$;
revoke execute on function private.assign_invoice_number() from public, anon, authenticated;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number before insert or update of invoice_number on public.invoices
  for each row execute function private.assign_invoice_number();
