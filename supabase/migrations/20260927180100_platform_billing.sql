-- ── Self-service subscriptions (PayFast) ─────────────────────────────────────
-- A company's master account picks a plan in Plan & billing and pays monthly
-- by card or debit order through the platform owner's own PayFast account.
-- The `billing` edge function signs the subscription and, when PayFast
-- confirms each payment, records it: the company gets that plan, active,
-- paid for another month. Cancelling stops future payments; the plan runs to
-- the end of the paid month (the daily plan check does the rest).
--
-- The platform owner's PayFast details are kept here (set in Platform →
-- Billing); the app can set them but never read the key or passphrase back.
create table if not exists private.platform_billing (
  id boolean primary key default true check (id),
  merchant_id text check (merchant_id ~ '^[0-9]{5,12}$'),
  merchant_key text check (length(merchant_key) <= 40),
  passphrase text check (length(passphrase) <= 100),
  sandbox boolean not null default true,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on private.platform_billing from public, anon, authenticated;

create table if not exists public.billing_payments (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  plan text not null,
  amount numeric(12,2) not null,
  pf_payment_id text not null unique,
  paid_at timestamptz not null default now(),
  paid_until date not null
);
alter table public.billing_payments enable row level security;
drop policy if exists billing_payments_select on public.billing_payments;
create policy billing_payments_select on public.billing_payments for select to authenticated
  using (private.is_team_owner(team_id) or private.is_platform_admin());
revoke all on public.billing_payments from anon, authenticated;
grant select on public.billing_payments to authenticated;

-- ── Platform owner: PayFast details ──
create or replace function private.admin_set_billing(p_merchant_id text, p_merchant_key text, p_passphrase text,
                                                     p_sandbox boolean, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b private.platform_billing;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  if p_merchant_id is not null and trim(p_merchant_id) <> '' and trim(p_merchant_id) !~ '^[0-9]{5,12}$' then
    raise exception 'The merchant ID is a number from PayFast';
  end if;
  insert into private.platform_billing as x (id, merchant_id, merchant_key, passphrase, sandbox, enabled)
  values (true, nullif(trim(p_merchant_id), ''), nullif(trim(p_merchant_key), ''), nullif(p_passphrase, ''),
          coalesce(p_sandbox, true), coalesce(p_enabled, false))
  on conflict (id) do update set
    merchant_id = coalesce(nullif(trim(p_merchant_id), ''), x.merchant_id),
    merchant_key = coalesce(nullif(trim(p_merchant_key), ''), x.merchant_key),
    passphrase = coalesce(nullif(p_passphrase, ''), x.passphrase),
    sandbox = coalesce(p_sandbox, x.sandbox),
    enabled = coalesce(p_enabled, x.enabled),
    updated_at = now()
  returning * into b;
  -- PayFast only accepts subscriptions signed with a passphrase.
  if b.enabled and (b.merchant_id is null or b.merchant_key is null or b.passphrase is null) then
    raise exception 'Enter the merchant ID, key and passphrase before switching billing on';
  end if;
  return jsonb_build_object('enabled', b.enabled, 'sandbox', b.sandbox, 'merchant_id', b.merchant_id,
                            'has_key', b.merchant_key is not null, 'has_passphrase', b.passphrase is not null);
end $$;

create or replace function private.admin_get_billing() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_build_object('enabled', b.enabled, 'sandbox', b.sandbox, 'merchant_id', b.merchant_id,
                                             'has_key', b.merchant_key is not null, 'has_passphrase', b.passphrase is not null)
                     from private.platform_billing b),
                  jsonb_build_object('enabled', false, 'sandbox', true, 'has_key', false, 'has_passphrase', false));
end $$;

-- Is self-service paying switched on? (Plan & billing shows "Pay" or "Contact us".)
create or replace function private.billing_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from private.platform_billing), false);
$$;

-- The caller's company, if they're its master account (the edge function
-- checks this as the person pressing "Choose").
create or replace function private.billing_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('team_id', t.id, 'company', t.name, 'email', u.email,
                            'plan', tp.plan, 'billing_status', tp.billing_status, 'billing_token', tp.billing_token)
    from public.teams t
    join auth.users u on u.id = auth.uid()
    left join public.team_plans tp on tp.team_id = t.id
   where t.owner_user_id = auth.uid()
   limit 1;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_set_billing(text, text, text, boolean, boolean)', 'admin_get_billing()',
                           'billing_available()', 'billing_context()'] loop
    execute format('revoke execute on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;
create or replace function public.admin_set_billing(p_merchant_id text, p_merchant_key text, p_passphrase text,
                                                    p_sandbox boolean, p_enabled boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.admin_set_billing(p_merchant_id, p_merchant_key, p_passphrase, p_sandbox, p_enabled);
$$;
create or replace function public.admin_get_billing() returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_get_billing(); $$;
create or replace function public.billing_available() returns boolean
language sql security invoker set search_path = '' as $$ select private.billing_available(); $$;
create or replace function public.billing_context() returns jsonb
language sql security invoker set search_path = '' as $$ select private.billing_context(); $$;
do $$
declare f text;
begin
  foreach f in array array['admin_set_billing(text, text, text, boolean, boolean)', 'admin_get_billing()',
                           'billing_available()', 'billing_context()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── For the billing edge function only (service role) ──
create or replace function public.billing_gateway() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(b) - 'id' from private.platform_billing b where b.enabled;
$$;

-- A confirmed payment: that plan, active, paid a month further. Once per
-- PayFast payment (they may notify more than once).
create or replace function public.billing_record_payment(p_team_id uuid, p_plan text, p_amount numeric,
                                                         p_pf_payment_id text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_price numeric := (private.plan_catalogue() -> p_plan ->> 'price')::numeric;
  v_until date;
  v_owner uuid;
begin
  if p_plan not in ('starter', 'pro', 'enterprise') then raise exception 'Unknown plan'; end if;
  if p_pf_payment_id is null or p_pf_payment_id !~ '^[0-9A-Za-z_-]{1,40}$' then raise exception 'Bad payment id'; end if;
  if exists (select 1 from public.billing_payments where pf_payment_id = p_pf_payment_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  -- Paid less than the plan costs (e.g. prices changed): record it, don't upgrade.
  if v_price is null or p_amount + 0.01 < v_price then
    insert into public.events (user_id, name, data, "timestamp")
    select owner_user_id, 'billing_underpaid', jsonb_build_object('team_id', p_team_id, 'plan', p_plan, 'amount', p_amount, 'price', v_price), now()
      from public.teams where id = p_team_id;
    return jsonb_build_object('ok', false, 'reason', 'underpaid');
  end if;
  insert into public.team_plans (team_id) values (p_team_id) on conflict (team_id) do nothing;
  select (greatest(coalesce(paid_until, current_date), current_date) + interval '1 month')::date into v_until
    from public.team_plans where team_id = p_team_id;
  update public.team_plans
     set plan = p_plan, status = 'active', paid_until = v_until, billing_status = 'active',
         billing_token = coalesce(nullif(p_token, ''), billing_token), trial_ends_at = null, updated_at = now()
   where team_id = p_team_id;
  insert into public.billing_payments (team_id, plan, amount, pf_payment_id, paid_until)
  values (p_team_id, p_plan, round(p_amount, 2), p_pf_payment_id, v_until);
  select owner_user_id into v_owner from public.teams where id = p_team_id;
  insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
  values (p_team_id, v_owner, v_owner, 'plan', p_team_id, 'Subscription',
          format('Payment received: %s plan, paid until %s. Thank you!',
                 coalesce(private.plan_catalogue() -> p_plan ->> 'name', p_plan), to_char(v_until, 'DD Mon YYYY')));
  return jsonb_build_object('ok', true, 'paid_until', v_until);
end $$;

create or replace function public.billing_mark_cancelled(p_team_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.team_plans set billing_status = 'cancelled', updated_at = now() where team_id = p_team_id;
$$;

do $$
declare f text;
begin
  foreach f in array array['billing_gateway()', 'billing_record_payment(uuid, text, numeric, text, text)',
                           'billing_mark_cancelled(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  -- Dependent records first, so deleting in this order never trips a reference.
  select array['reminder_log','client_portal_links','stock_movements','products','time_entries','payments','invoices','jobs',
               'service_plans','repair_reports','breakdown_reports','followups','notes','activities','leads','equipment',
               'quotes','contacts','expenses','vehicle_checks','custom_faults','company_documents',
               'machine_jack_confirmations','team_notifications','billing_payments','clients']::text[];
$$;
