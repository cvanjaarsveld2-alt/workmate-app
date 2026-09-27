-- ── Online quote acceptance ──────────────────────────────────────────────────
-- A company shares a link (/?quote=TOKEN) with its customer. Without signing
-- in, the customer sees the quote and accepts it (name, signature, optional
-- order number) or declines it. The quote's status changes and the person who
-- owns the quote is notified. Links are 48 random hex characters and expire
-- (the quote's expiry date, else 60 days).
alter table public.quotes add column if not exists share_token text;
alter table public.quotes add column if not exists share_expires_at timestamptz;
alter table public.quotes add column if not exists accepted_at timestamptz;
alter table public.quotes add column if not exists accepted_by_name text check (length(accepted_by_name) <= 120);
alter table public.quotes add column if not exists accepted_signature text
  check (accepted_signature is null or (length(accepted_signature) <= 200000 and accepted_signature ~ '^data:image/png;base64,'));
alter table public.quotes add column if not exists accepted_po text check (length(accepted_po) <= 60);
alter table public.quotes add column if not exists declined_at timestamptz;
alter table public.quotes add column if not exists decline_reason text check (length(decline_reason) <= 1000);
create unique index if not exists quotes_share_token_uidx on public.quotes (share_token) where share_token is not null;

create or replace function private.create_quote_link(p_quote_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
  v_q public.quotes;
begin
  select * into v_q from public.quotes q where q.id = p_quote_id and (
    q.user_id = auth.uid() or q.assigned_to_user_id = auth.uid()
    or (q.team_id is not null and private.can_see_team(q.team_id)));
  if not found then raise exception 'Quote not found'; end if;
  if v_q.team_id is not null and private.team_access(v_q.team_id) <> 'full' then raise exception 'Your account is read-only'; end if;
  v_token := coalesce(v_q.share_token, encode(extensions.gen_random_bytes(24), 'hex'));
  update public.quotes
     set share_token = v_token,
         share_expires_at = greatest(coalesce(v_q.expiry_date::timestamptz + interval '1 day', now() + interval '60 days'), now() + interval '7 days')
   where id = p_quote_id;
  return v_token;
end $$;

create or replace function private.revoke_quote_link(p_quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.quotes q set share_token = null, share_expires_at = null
   where q.id = p_quote_id and (q.user_id = auth.uid() or q.assigned_to_user_id = auth.uid()
     or (q.team_id is not null and private.can_see_team(q.team_id)));
end $$;

-- What the customer sees. Only what's on the quote itself.
create or replace function public.get_shared_quote(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q public.quotes;
  v_p public.team_profiles;
  v_client text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into v_q from public.quotes where share_token = p_token and share_expires_at > now();
  if not found then return null; end if;
  if v_q.team_id is not null and private.team_access(v_q.team_id) = 'suspended' then return null; end if;
  select * into v_p from public.team_profiles where team_id = v_q.team_id;
  select company into v_client from public.clients where id = v_q.client_id;
  return jsonb_build_object(
    'quote', jsonb_build_object(
      'number', coalesce(v_q.quote_number, upper(left(replace(v_q.id::text, '-', ''), 8))),
      'description', v_q.description, 'line_items', v_q.line_items, 'value', v_q.value,
      'vat_inclusive', v_q.vat_inclusive, 'date', coalesce(v_q.sent_date, v_q.created_at::date),
      'expiry_date', v_q.expiry_date, 'status', v_q.status,
      'title', v_q.details ->> 'title', 'intro', v_q.details ->> 'intro', 'exclusions', v_q.details ->> 'exclusions',
      'accepted_at', v_q.accepted_at, 'accepted_by_name', v_q.accepted_by_name, 'declined_at', v_q.declined_at),
    'client', coalesce(v_client, v_q.client_name),
    'company', jsonb_build_object(
      'name', coalesce(v_p.trading_name, v_p.legal_name), 'legal_name', v_p.legal_name, 'logo_data', v_p.logo_data,
      'brand_color', v_p.brand_color, 'vat_no', v_p.vat_no, 'vat_registered', coalesce(v_p.vat_registered, true),
      'phone', v_p.phone, 'email', v_p.email, 'quote_terms', v_p.quote_terms,
      'quote_validity_days', v_p.quote_validity_days));
end $$;

create or replace function public.respond_to_shared_quote(p_token text, p_accept boolean, p_name text, p_signature text, p_po text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_q public.quotes;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then raise exception 'This link is not valid'; end if;
  select * into v_q from public.quotes where share_token = p_token and share_expires_at > now() for update;
  if not found then raise exception 'This link has expired. Ask for a new one.'; end if;
  if v_q.accepted_at is not null or v_q.declined_at is not null then raise exception 'This quote has already been answered'; end if;
  if v_q.team_id is not null and private.team_access(v_q.team_id) = 'suspended' then raise exception 'This link is not available'; end if;
  if p_accept then
    if coalesce(trim(p_name), '') = '' then raise exception 'Please type your name'; end if;
    if p_signature is null or p_signature !~ '^data:image/png;base64,' or length(p_signature) > 200000 then raise exception 'Please sign'; end if;
    update public.quotes set status = 'Accepted', accepted_at = now(), accepted_by_name = left(trim(p_name), 120),
           accepted_signature = p_signature, accepted_po = nullif(left(trim(coalesce(p_po, '')), 60), ''),
           updated_at = now(), sync_status = 'synced'
     where id = v_q.id;
  else
    update public.quotes set status = 'Rejected', declined_at = now(), decline_reason = left(nullif(trim(coalesce(p_reason, '')), ''), 1000),
           updated_at = now(), sync_status = 'synced'
     where id = v_q.id;
  end if;
  if v_q.team_id is not null then
    insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
    values (v_q.team_id, v_q.user_id, v_q.user_id, 'quote', v_q.id, coalesce(v_q.client_name, 'Quote'),
            case when p_accept then format('Accepted online by %s%s', left(trim(p_name), 120), case when coalesce(trim(p_po), '') <> '' then ' (order ' || left(trim(p_po), 60) || ')' else '' end)
                 else 'Declined online' || coalesce(': ' || left(nullif(trim(coalesce(p_reason, '')), ''), 300), '') end);
  end if;
  insert into public.events (user_id, name, data, "timestamp")
  values (v_q.user_id, case when p_accept then 'quote_accepted_online' else 'quote_declined_online' end, jsonb_build_object('quote_id', v_q.id), now());
  return jsonb_build_object('ok', true, 'status', case when p_accept then 'Accepted' else 'Rejected' end);
end $$;

-- The two customer-facing functions live in public (security definer, token
-- checked inside) so anonymous visitors need no access to the private schema.
revoke execute on function private.create_quote_link(uuid) from public, anon;
revoke execute on function private.revoke_quote_link(uuid) from public, anon;
grant execute on function private.create_quote_link(uuid) to authenticated;
grant execute on function private.revoke_quote_link(uuid) to authenticated;
revoke execute on function public.get_shared_quote(text) from public;
revoke execute on function public.respond_to_shared_quote(text, boolean, text, text, text, text) from public;
grant execute on function public.get_shared_quote(text) to anon, authenticated;
grant execute on function public.respond_to_shared_quote(text, boolean, text, text, text, text) to anon, authenticated;

create or replace function public.create_quote_link(p_quote_id uuid) returns text
language sql security invoker set search_path = '' as $$ select private.create_quote_link(p_quote_id); $$;
create or replace function public.revoke_quote_link(p_quote_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_quote_link(p_quote_id); $$;
revoke execute on function public.create_quote_link(uuid) from public, anon;
revoke execute on function public.revoke_quote_link(uuid) from public, anon;
grant execute on function public.create_quote_link(uuid) to authenticated;
grant execute on function public.revoke_quote_link(uuid) to authenticated;
