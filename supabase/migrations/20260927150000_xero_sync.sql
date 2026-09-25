-- ── Xero sync ─────────────────────────────────────────────────────────────────
-- A company's master account connects its Xero organisation (OAuth, through
-- the `xero` edge function). Finished invoices are then created in Xero as
-- approved sales invoices: nightly, and on demand from Company Details. Each
-- invoice goes once (invoices.xero_invoice_id). Tokens live in the private
-- schema; only the edge function (service role) reads them.
alter table public.invoices add column if not exists xero_invoice_id text;
alter table public.invoices add column if not exists xero_synced_at timestamptz;

-- Once an invoice is in Xero it stays linked: a phone saving an older copy of
-- the invoice can't clear the link (which would send it to Xero again).
create or replace function private.keep_xero_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.xero_invoice_id := coalesce(new.xero_invoice_id, old.xero_invoice_id);
  new.xero_synced_at := coalesce(new.xero_synced_at, old.xero_synced_at);
  return new;
end $$;
drop trigger if exists invoices_keep_xero_link on public.invoices;
create trigger invoices_keep_xero_link before update on public.invoices
  for each row execute function private.keep_xero_link();

create table if not exists private.xero_connections (
  team_id uuid primary key references public.teams(id) on delete cascade,
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  sales_account_code text not null default '200',
  connected_by uuid,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_result jsonb
);
create table if not exists private.xero_oauth_states (
  state text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
revoke all on private.xero_connections from public, anon, authenticated;
revoke all on private.xero_oauth_states from public, anon, authenticated;

-- Starting a connection: the master account gets a one-time state for the
-- Xero sign-in (valid 15 minutes).
create or replace function private.xero_start(p_team_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can connect Xero'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  delete from private.xero_oauth_states where created_at < now() - interval '15 minutes' or team_id = p_team_id;
  v_state := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.xero_oauth_states (state, team_id, user_id) values (v_state, p_team_id, auth.uid());
  return v_state;
end $$;

create or replace function private.xero_status(p_team_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when private.is_team_owner(p_team_id) or public.is_team_admin(p_team_id) then
    coalesce((select jsonb_build_object('connected', true, 'organisation', x.tenant_name, 'connected_at', x.connected_at,
                                        'last_sync_at', x.last_sync_at, 'last_sync_result', x.last_sync_result,
                                        'sales_account_code', x.sales_account_code,
                                        'waiting', (select count(*) from public.invoices i
                                                     where i.team_id = p_team_id and i.xero_invoice_id is null
                                                       and coalesce(i.status, '') not in ('draft', 'cancelled', 'void')
                                                       and i.invoice_number !~ '^INV-\d{4}-\d{6,7}$'))
                from private.xero_connections x where x.team_id = p_team_id),
             jsonb_build_object('connected', false))
  end;
$$;

create or replace function private.xero_disconnect(p_team_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can disconnect Xero'; end if;
  delete from private.xero_connections where team_id = p_team_id;
end $$;

create or replace function private.xero_set_account(p_team_id uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_team_owner(p_team_id) then raise exception 'Only the master account can change this'; end if;
  if p_code !~ '^[A-Za-z0-9._-]{1,10}$' then raise exception 'Enter a Xero account code, e.g. 200'; end if;
  update private.xero_connections set sales_account_code = p_code where team_id = p_team_id;
end $$;

-- Whoever may press "Sync now" (the edge function checks this as the user).
create or replace function private.xero_can_sync(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.same_team(p_team_id) and private.is_team_manager(p_team_id) and private.team_access(p_team_id) = 'full';
$$;

revoke execute on function private.xero_start(uuid) from public, anon;
revoke execute on function private.xero_status(uuid) from public, anon;
revoke execute on function private.xero_disconnect(uuid) from public, anon;
revoke execute on function private.xero_set_account(uuid, text) from public, anon;
revoke execute on function private.xero_can_sync(uuid) from public, anon;
grant execute on function private.xero_start(uuid) to authenticated;
grant execute on function private.xero_status(uuid) to authenticated;
grant execute on function private.xero_disconnect(uuid) to authenticated;
grant execute on function private.xero_set_account(uuid, text) to authenticated;
grant execute on function private.xero_can_sync(uuid) to authenticated;
create or replace function public.xero_start(p_team_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.xero_start(p_team_id); $$;
create or replace function public.xero_status(p_team_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.xero_status(p_team_id); $$;
create or replace function public.xero_disconnect(p_team_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.xero_disconnect(p_team_id); $$;
create or replace function public.xero_set_account(p_team_id uuid, p_code text) returns void
language sql security invoker set search_path = '' as $$ select private.xero_set_account(p_team_id, p_code); $$;
create or replace function public.xero_can_sync(p_team_id uuid) returns boolean
language sql security invoker set search_path = '' as $$ select private.xero_can_sync(p_team_id); $$;
revoke execute on function public.xero_start(uuid) from public, anon;
revoke execute on function public.xero_status(uuid) from public, anon;
revoke execute on function public.xero_disconnect(uuid) from public, anon;
revoke execute on function public.xero_set_account(uuid, text) from public, anon;
revoke execute on function public.xero_can_sync(uuid) from public, anon;
grant execute on function public.xero_start(uuid) to authenticated;
grant execute on function public.xero_status(uuid) to authenticated;
grant execute on function public.xero_disconnect(uuid) to authenticated;
grant execute on function public.xero_set_account(uuid, text) to authenticated;
grant execute on function public.xero_can_sync(uuid) to authenticated;

-- ── For the edge function only (service role) ──
create or replace function public.xero_take_state(p_state text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s private.xero_oauth_states;
begin
  delete from private.xero_oauth_states where state = p_state and created_at > now() - interval '15 minutes' returning * into s;
  if not found then return null; end if;
  return jsonb_build_object('team_id', s.team_id, 'user_id', s.user_id);
end $$;

create or replace function public.xero_state_valid(p_state text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.xero_oauth_states where state = p_state and created_at > now() - interval '15 minutes');
$$;

create or replace function public.xero_save_connection(p_team_id uuid, p_user_id uuid, p_tenant_id text, p_tenant_name text,
                                                       p_access text, p_refresh text, p_expires_in int) returns void
language sql security definer set search_path = '' as $$
  insert into private.xero_connections (team_id, tenant_id, tenant_name, access_token, refresh_token, expires_at, connected_by)
  values (p_team_id, p_tenant_id, p_tenant_name, p_access, p_refresh, now() + make_interval(secs => p_expires_in - 60), p_user_id)
  on conflict (team_id) do update set tenant_id = excluded.tenant_id, tenant_name = excluded.tenant_name,
    access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
    connected_by = excluded.connected_by, connected_at = now();
$$;

create or replace function public.xero_connection(p_team_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(x) from private.xero_connections x where x.team_id = p_team_id;
$$;

create or replace function public.xero_update_tokens(p_team_id uuid, p_access text, p_refresh text, p_expires_in int) returns void
language sql security definer set search_path = '' as $$
  update private.xero_connections set access_token = p_access, refresh_token = p_refresh,
         expires_at = now() + make_interval(secs => p_expires_in - 60) where team_id = p_team_id;
$$;

-- Invoices to send (with their lines and customer), oldest first.
create or replace function public.xero_invoices_to_sync(p_team_id uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x.issue_date), '[]'::jsonb) from (
    select i.id, i.invoice_number, i.issue_date, i.due_date, i.subtotal, i.vat, i.total, i.line_items, i.notes,
           coalesce(c.company, 'Customer') as client, c.email, c.vat_number,
           (select coalesce(tp.vat_registered, true) from public.team_profiles tp where tp.team_id = i.team_id) as vat_registered,
           (select coalesce(tp.payment_terms_days, 30) from public.team_profiles tp where tp.team_id = i.team_id) as terms
      from public.invoices i left join public.clients c on c.id = i.client_id
     where i.team_id = p_team_id and i.xero_invoice_id is null
       and coalesce(i.status, '') not in ('draft', 'cancelled', 'void')
       and i.invoice_number !~ '^INV-\d{4}-\d{6,7}$'
     order by i.issue_date limit p_limit) x;
$$;

create or replace function public.xero_mark_synced(p_team_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  for r in select value from jsonb_array_elements(p_results) loop
    if r ->> 'xero_id' is not null then
      update public.invoices set xero_invoice_id = r ->> 'xero_id', xero_synced_at = now()
       where id = (r ->> 'id')::uuid and team_id = p_team_id;
    end if;
  end loop;
  update private.xero_connections set last_sync_at = now(),
         last_sync_result = jsonb_build_object('sent', (select count(*) from jsonb_array_elements(p_results) e where e ->> 'xero_id' is not null),
                                               'failed', (select count(*) from jsonb_array_elements(p_results) e where e ->> 'xero_id' is null),
                                               'errors', (select jsonb_agg(e -> 'error') from (select e from jsonb_array_elements(p_results) e where e ->> 'error' is not null limit 5) z))
   where team_id = p_team_id;
end $$;

create or replace function public.xero_connected_teams() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select x.team_id from private.xero_connections x where private.team_access(x.team_id) = 'full';
$$;

do $$
declare f text;
begin
  foreach f in array array['xero_take_state(text)', 'xero_state_valid(text)', 'xero_save_connection(uuid, uuid, text, text, text, text, int)',
                           'xero_connection(uuid)', 'xero_update_tokens(uuid, text, text, int)', 'xero_invoices_to_sync(uuid, int)',
                           'xero_mark_synced(uuid, jsonb)', 'xero_connected_teams()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Nightly sync of every connected company (02:30 SAST).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-xero-sync') then
    perform cron.unschedule('powermate-xero-sync');
  end if;
  perform cron.schedule('powermate-xero-sync', '30 0 * * *', $cmd$
    select net.http_post(
      url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/xero',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)),
      body := '{"action":"sync_all"}'::jsonb);
  $cmd$);
end $$;
