-- ── Online payments (PayFast) ─────────────────────────────────────────────────
-- Each company can connect its own PayFast merchant account. Customers then
-- pay invoices by card or instant EFT from their portal. PayFast tells the
-- `payfast` edge function when a payment completes; the function checks it
-- with PayFast and records the payment, which marks the invoice paid (the
-- existing payments trigger).
--
-- The merchant key and passphrase are kept in the private schema: the app can
-- set them (master account, with two-step login when enabled) but never read
-- them back. Only the edge function (service role) uses them.
create table if not exists private.payment_gateways (
  team_id uuid primary key references public.teams(id) on delete cascade,
  provider text not null default 'payfast' check (provider = 'payfast'),
  merchant_id text check (merchant_id ~ '^[0-9]{5,12}$'),
  merchant_key text check (length(merchant_key) <= 40),
  passphrase text check (length(passphrase) <= 100),
  sandbox boolean not null default true,
  enabled boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on private.payment_gateways from public, anon, authenticated;

create or replace function private.set_payfast(p_team_id uuid, p_merchant_id text, p_merchant_key text, p_passphrase text,
                                               p_sandbox boolean, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g private.payment_gateways;
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can connect payments'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  if p_merchant_id is not null and trim(p_merchant_id) !~ '^[0-9]{5,12}$' then raise exception 'The merchant ID is a number from PayFast'; end if;
  insert into private.payment_gateways as x (team_id, merchant_id, merchant_key, passphrase, sandbox, enabled, updated_by, updated_at)
  values (p_team_id, nullif(trim(p_merchant_id), ''), nullif(trim(p_merchant_key), ''), nullif(p_passphrase, ''),
          coalesce(p_sandbox, true), coalesce(p_enabled, false), auth.uid(), now())
  on conflict (team_id) do update set
    merchant_id = coalesce(nullif(trim(p_merchant_id), ''), x.merchant_id),
    -- Blank keeps what's saved (the app never shows the key or passphrase).
    merchant_key = coalesce(nullif(trim(p_merchant_key), ''), x.merchant_key),
    passphrase = coalesce(nullif(p_passphrase, ''), x.passphrase),
    sandbox = coalesce(p_sandbox, x.sandbox),
    enabled = coalesce(p_enabled, x.enabled),
    updated_by = auth.uid(), updated_at = now()
  returning * into g;
  if g.enabled and (g.merchant_id is null or g.merchant_key is null) then
    raise exception 'Enter the merchant ID and key before switching online payments on';
  end if;
  return jsonb_build_object('enabled', g.enabled, 'sandbox', g.sandbox, 'merchant_id', g.merchant_id,
                            'has_key', g.merchant_key is not null, 'has_passphrase', g.passphrase is not null);
end $$;

create or replace function private.get_payfast(p_team_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_team_owner(p_team_id) or public.is_team_admin(p_team_id) then
    coalesce((select jsonb_build_object('enabled', g.enabled, 'sandbox', g.sandbox, 'merchant_id', g.merchant_id,
                                        'has_key', g.merchant_key is not null, 'has_passphrase', g.passphrase is not null)
                from private.payment_gateways g where g.team_id = p_team_id),
             jsonb_build_object('enabled', false, 'sandbox', true, 'merchant_id', null, 'has_key', false, 'has_passphrase', false))
  end;
$$;
revoke execute on function private.set_payfast(uuid, text, text, text, boolean, boolean) from public, anon;
revoke execute on function private.get_payfast(uuid) from public, anon;
grant execute on function private.set_payfast(uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function private.get_payfast(uuid) to authenticated;
create or replace function public.set_payfast_settings(p_team_id uuid, p_merchant_id text, p_merchant_key text, p_passphrase text,
                                                       p_sandbox boolean, p_enabled boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.set_payfast(p_team_id, p_merchant_id, p_merchant_key, p_passphrase, p_sandbox, p_enabled);
$$;
create or replace function public.get_payfast_settings(p_team_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.get_payfast(p_team_id); $$;
revoke execute on function public.set_payfast_settings(uuid, text, text, text, boolean, boolean) from public, anon;
revoke execute on function public.get_payfast_settings(uuid) from public, anon;
grant execute on function public.set_payfast_settings(uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.get_payfast_settings(uuid) to authenticated;

-- Can this portal's customer pay online? (Shown as "Pay now".)
create or replace function public.portal_can_pay(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.client_portal_links l join private.payment_gateways g on g.team_id = l.team_id
     where p_token ~ '^[0-9a-f]{48}$' and l.token = p_token and l.revoked_at is null and g.enabled
       and private.team_access(l.team_id) <> 'suspended');
$$;
revoke execute on function public.portal_can_pay(text) from public;
grant execute on function public.portal_can_pay(text) to anon, authenticated;

-- ── For the edge function only (service role) ──
-- What PayFast needs to take payment of an invoice from this portal.
create or replace function public.payfast_checkout_data(p_token text, p_invoice_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.client_portal_links;
  i public.invoices;
  g private.payment_gateways;
  c public.clients;
  v_name text;
  v_balance numeric;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into l from public.client_portal_links where token = p_token and revoked_at is null;
  if not found or private.team_access(l.team_id) = 'suspended' then return null; end if;
  select * into i from public.invoices where id = p_invoice_id and client_id = l.client_id and team_id = l.team_id
     and coalesce(status, '') not in ('draft', 'cancelled', 'void');
  if not found then return null; end if;
  select * into g from private.payment_gateways where team_id = l.team_id and enabled;
  if not found or g.merchant_id is null or g.merchant_key is null then return null; end if;
  v_balance := coalesce(i.balance_due, i.total - coalesce(i.amount_paid, 0));
  if v_balance is null or v_balance <= 0 then return jsonb_build_object('paid', true); end if;
  select * into c from public.clients where id = l.client_id;
  select coalesce(trading_name, legal_name) into v_name from public.team_profiles where team_id = l.team_id;
  return jsonb_build_object('merchant_id', g.merchant_id, 'merchant_key', g.merchant_key, 'passphrase', g.passphrase,
    'sandbox', g.sandbox, 'amount', round(v_balance, 2), 'invoice_id', i.id, 'invoice_number', i.invoice_number,
    'company', v_name, 'email', c.email);
end $$;

-- The gateway settings behind an invoice (to check PayFast's notification).
create or replace function public.payfast_gateway_for_invoice(p_invoice_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('merchant_id', g.merchant_id, 'passphrase', g.passphrase, 'sandbox', g.sandbox,
                            'balance', coalesce(i.balance_due, i.total - coalesce(i.amount_paid, 0)))
    from public.invoices i join private.payment_gateways g on g.team_id = i.team_id
   where i.id = p_invoice_id and g.enabled;
$$;

-- Records a completed PayFast payment once (PayFast may notify more than once).
create or replace function public.payfast_record_payment(p_invoice_id uuid, p_amount numeric, p_pf_payment_id text, p_fee numeric,
                                                         p_method text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  i public.invoices;
  v_key text := 'payfast:' || p_pf_payment_id;
  v_id uuid;
begin
  if p_pf_payment_id is null or p_pf_payment_id !~ '^[0-9A-Za-z_-]{1,40}$' then raise exception 'Bad payment id'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Bad amount'; end if;
  select * into i from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if exists (select 1 from public.payments where idempotency_key = v_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  insert into public.payments (id, user_id, team_id, invoice_id, amount, payment_date, method, reference, notes, idempotency_key, sync_status)
  values (gen_random_uuid(), i.user_id, i.team_id, i.id, round(p_amount, 2), current_date,
          -- PayFast's payment_method: cc = card, ef/eft/ie = instant EFT.
          case lower(coalesce(p_method, '')) when 'cc' then 'card' when 'ef' then 'instant_eft' when 'eft' then 'instant_eft'
               when 'ie' then 'instant_eft' else 'other' end,
          'PayFast ' || p_pf_payment_id,
          case when p_fee is not null and p_fee <> 0 then format('Paid online. PayFast fee R %s', to_char(abs(p_fee), 'FM999999990.00')) else 'Paid online' end,
          v_key, 'synced')
  returning id into v_id;
  if i.team_id is not null then
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
    values (i.team_id, i.user_id, i.user_id, 'invoice', i.id, coalesce(i.invoice_number, 'Invoice'),
            format('Paid online: R %s', to_char(p_amount, 'FM999999990.00')));
  end if;
  return jsonb_build_object('ok', true, 'payment_id', v_id);
end $$;

revoke execute on function public.payfast_checkout_data(text, uuid) from public, anon, authenticated;
revoke execute on function public.payfast_gateway_for_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.payfast_record_payment(uuid, numeric, text, numeric, text) from public, anon, authenticated;
grant execute on function public.payfast_checkout_data(text, uuid) to service_role;
grant execute on function public.payfast_gateway_for_invoice(uuid) to service_role;
grant execute on function public.payfast_record_payment(uuid, numeric, text, numeric, text) to service_role;
