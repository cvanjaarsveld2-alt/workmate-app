-- Mail agent: reads the mailboxes people connect (Microsoft 365 / Outlook,
-- Gmail, or any IMAP mailbox such as iCloud) every few minutes and brings in
-- what matters to the company:
--   expense        receipts and supplier bills        → Expenses
--   quote_request  a customer asking for a quote      → a lead
--   customer_email mail from a known customer         → the customer's timeline
--   supplier_doc   supplier quotes, order confirmations→ the purchase order
-- Everything lands in the Inbox (inbox_items) for a person to check, unless
-- the company switches on auto-filing, when only confident items are filed by
-- themselves (see private.inbox_file and the mail-agent Edge Function).
--
-- Privacy: mail is only read from a connected mailbox, only new mail since it
-- was connected (and the 7 days before), and it's pre-filtered before any AI
-- sees it. Items from someone's mailbox are visible to that person and the
-- company's master account/admins only.

-- ── Connections ──
create table private.mail_connections (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('microsoft', 'google', 'imap')),
  email text not null,
  folder text not null default 'INBOX',
  imap_host text,
  imap_port integer,
  -- The refresh token or IMAP password, encrypted in Vault.
  secret_id uuid not null,
  access_token text,
  access_expires_at timestamptz,
  -- Where the last check stopped: Graph delta link, Gmail history id, or
  -- IMAP "uidvalidity:last uid".
  cursor text,
  status text not null default 'active' check (status in ('active', 'paused', 'error')),
  last_error text,
  last_run_at timestamptz,
  last_found_at timestamptz,
  found_total integer not null default 0,
  created_at timestamptz not null default now(),
  unique (team_id, user_id, provider, email)
);
create index mail_connections_team_idx on private.mail_connections (team_id);
create index mail_connections_user_idx on private.mail_connections (user_id);
create table private.mail_oauth_states (
  state text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  provider text not null,
  created_at timestamptz not null default now()
);
create index mail_oauth_states_team_idx on private.mail_oauth_states (team_id);
revoke all on private.mail_connections from public, anon, authenticated;
revoke all on private.mail_oauth_states from public, anon, authenticated;

-- ── Company settings ──
alter table public.team_profiles add column if not exists mail_agent_auto boolean not null default false;
alter table public.team_profiles add column if not exists mail_agent_kinds text[] not null
  default array['expense', 'quote_request', 'customer_email', 'supplier_doc'];
alter table public.team_profiles drop constraint if exists team_profiles_mail_agent_kinds_check;
alter table public.team_profiles add constraint team_profiles_mail_agent_kinds_check
  check (mail_agent_kinds <@ array['expense', 'quote_request', 'customer_email', 'supplier_doc']);

-- ── Inbox items from mailboxes ──
alter table public.inbox_items
  add column if not exists kind text not null default 'expense',
  add column if not exists source text not null default 'forward',
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists connection_id uuid references private.mail_connections(id) on delete set null,
  add column if not exists confidence numeric,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists activity_id uuid references public.activities(id) on delete set null,
  add column if not exists auto_filed boolean not null default false;
alter table public.inbox_items drop constraint if exists inbox_items_kind_check;
alter table public.inbox_items add constraint inbox_items_kind_check
  check (kind in ('expense', 'quote_request', 'customer_email', 'supplier_doc'));
alter table public.inbox_items drop constraint if exists inbox_items_source_check;
alter table public.inbox_items add constraint inbox_items_source_check check (source in ('forward', 'mailbox'));
create index if not exists inbox_items_owner_idx on public.inbox_items (owner_user_id);
create index if not exists inbox_items_connection_idx on public.inbox_items (connection_id);
create index if not exists inbox_items_client_idx on public.inbox_items (client_id);
create index if not exists inbox_items_contact_idx on public.inbox_items (contact_id);
create index if not exists inbox_items_po_idx on public.inbox_items (purchase_order_id);
create index if not exists inbox_items_lead_idx on public.inbox_items (lead_id);
create index if not exists inbox_items_activity_idx on public.inbox_items (activity_id);

-- Who may see an item: anyone in the company for mail forwarded to the
-- company address; for mail from someone's own mailbox, that person and the
-- master account/admins.
create or replace function private.can_see_inbox_item(p_team uuid, p_source text, p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.same_team(p_team) and private.team_access(p_team) <> 'suspended'
     and (p_source = 'forward' or p_owner = auth.uid() or private.is_team_manager(p_team));
$$;
revoke execute on function private.can_see_inbox_item(uuid, text, uuid) from public, anon;
grant execute on function private.can_see_inbox_item(uuid, text, uuid) to authenticated;

drop policy if exists inbox_items_select on public.inbox_items;
create policy inbox_items_select on public.inbox_items for select to authenticated
  using (private.can_see_inbox_item(team_id, source, owner_user_id));

-- ── Filing (one place for people and the agent) ──
-- p_action: 'expense' | 'lead' | 'customer_note' | 'purchase_order'.
-- p_actor is who it's filed as (the person approving, or the mailbox owner
-- when the agent files by itself).
create or replace function private.inbox_file(p_id uuid, p_action text, p_fields jsonb, p_actor uuid, p_auto boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  it public.inbox_items;
  e public.expenses;
  v_amount numeric;
  v_vat numeric;
  v_currency text := upper(coalesce(nullif(trim(p_fields->>'currency'), ''), 'ZAR'));
  v_date date;
  v_zar numeric;
  v_client uuid;
  v_client_name text;
  v_contact uuid;
  v_id uuid;
  v_po public.purchase_orders;
  v_note text;
begin
  select * into it from public.inbox_items where id = p_id for update;
  if not found then raise exception 'Inbox item not found' using errcode = 'P0002'; end if;
  if it.status = 'approved' then
    raise exception 'This item has already been dealt with' using errcode = '23505';
  end if;
  if private.team_access(it.team_id) <> 'full' then
    raise exception 'Your company''s plan is read-only, so nothing new can be added' using errcode = '42501';
  end if;

  v_client := coalesce(nullif(p_fields->>'client_id', '')::uuid, it.client_id);
  if v_client is not null and not exists (select 1 from public.clients where id = v_client and team_id = it.team_id) then
    raise exception 'That customer isn''t in your company' using errcode = '42501';
  end if;
  v_contact := coalesce(nullif(p_fields->>'contact_id', '')::uuid, it.contact_id);
  if v_contact is not null and not exists (select 1 from public.contacts where id = v_contact and team_id = it.team_id) then
    v_contact := null;
  end if;
  select company into v_client_name from public.clients where id = v_client;

  if p_action = 'expense' then
    begin
      v_amount := round((p_fields->>'amount')::numeric, 2);
      v_vat := round(nullif(p_fields->>'vat_amount', '')::numeric, 2);
      v_date := coalesce(nullif(p_fields->>'expense_date', '')::date, (it.received_at at time zone 'Africa/Johannesburg')::date);
      v_zar := round(nullif(p_fields->>'amount_zar', '')::numeric, 2);
    exception when others then
      raise exception 'Check the amount, VAT and date' using errcode = '22023';
    end;
    if v_amount is null or v_amount <= 0 then raise exception 'Enter the amount before approving' using errcode = '22023'; end if;
    if v_vat is not null and (v_vat < 0 or v_vat > v_amount) then
      raise exception 'The VAT can''t be more than the amount' using errcode = '22023';
    end if;
    if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a 3-letter code, like ZAR' using errcode = '22023'; end if;
    if v_currency = 'ZAR' then v_zar := v_amount; end if;
    if nullif(p_fields->>'job_id', '') is not null and not exists (
         select 1 from public.jobs where id::text = p_fields->>'job_id' and team_id = it.team_id) then
      raise exception 'That job isn''t in your company' using errcode = '42501';
    end if;
    insert into public.expenses (
      id, user_id, team_id, vendor, vat_number, amount, vat_amount, currency,
      amount_zar, exchange_rate, rate_date, rate_source,
      expense_date, category, payment_method, notes, receipt_url, gl_code,
      status, ai_extracted, sync_status, job_id, client_id, client_name, created_at, updated_at
    ) values (
      gen_random_uuid(), p_actor, it.team_id,
      left(nullif(trim(p_fields->>'vendor'), ''), 200),
      left(coalesce(trim(p_fields->>'vat_number'), ''), 30),
      v_amount, v_vat, v_currency, v_zar,
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
      nullif(p_fields->>'job_id', '')::uuid, v_client, v_client_name,
      now(), now()
    ) returning * into e;
    update public.inbox_items set status = 'approved', expense_id = e.id, reviewed_by = case when p_auto then null else p_actor end,
           reviewed_at = now(), auto_filed = p_auto, error = null where id = it.id;
    return to_jsonb(e);

  elsif p_action = 'lead' then
    insert into public.leads (id, user_id, team_id, title, description, client_id, client_name, contact_id, contact_name,
                              captured_by, stage, lead_date, notes, sync_status, created_at, updated_at)
    values (gen_random_uuid(), p_actor, it.team_id,
            left(coalesce(nullif(trim(p_fields->>'title'), ''), nullif(trim(it.subject), ''), 'Quote request'), 200),
            left(coalesce(nullif(trim(p_fields->>'description'), ''), it.body_excerpt, ''), 4000),
            v_client, coalesce(v_client_name, nullif(trim(p_fields->>'company'), '')),
            v_contact, coalesce(nullif(trim(p_fields->>'contact_name'), ''), it.from_name),
            case when p_auto then 'Mail agent' else 'Email' end, 'New', current_date,
            left(concat_ws(E'\n', 'From ' || coalesce(it.from_name, '') || ' <' || coalesce(it.from_email, '') || '>',
                           nullif(trim(p_fields->>'notes'), '')), 2000),
            'synced', now(), now())
    returning id into v_id;
    update public.inbox_items set status = 'approved', lead_id = v_id, client_id = v_client, reviewed_by = case when p_auto then null else p_actor end,
           reviewed_at = now(), auto_filed = p_auto, error = null where id = it.id;
    return jsonb_build_object('lead_id', v_id);

  elsif p_action = 'customer_note' then
    if v_client is null then raise exception 'Choose the customer to file this on' using errcode = '22023'; end if;
    insert into public.activities (id, user_id, team_id, client_id, client_name, activity_type, summary, outcome, sync_status, created_at, updated_at)
    values (gen_random_uuid(), p_actor, it.team_id, v_client, v_client_name, 'email',
            left(coalesce(nullif(trim(p_fields->>'summary'), ''), 'Email: ' || coalesce(it.subject, '(no subject)')), 500),
            left(coalesce(nullif(trim(p_fields->>'notes'), ''), it.body_excerpt, ''), 4000),
            'synced', coalesce(it.received_at, now()), now())
    returning id into v_id;
    update public.inbox_items set status = 'approved', activity_id = v_id, client_id = v_client, reviewed_by = case when p_auto then null else p_actor end,
           reviewed_at = now(), auto_filed = p_auto, error = null where id = it.id;
    return jsonb_build_object('activity_id', v_id);

  elsif p_action = 'purchase_order' then
    select * into v_po from public.purchase_orders
     where id = coalesce(nullif(p_fields->>'purchase_order_id', '')::uuid, it.purchase_order_id) and team_id = it.team_id
     for update;
    if not found then raise exception 'Choose the purchase order this belongs to' using errcode = '22023'; end if;
    v_note := concat_ws(' · ', to_char(coalesce(it.received_at, now()) at time zone 'Africa/Johannesburg', 'YYYY-MM-DD'),
                        coalesce(nullif(trim(p_fields->>'summary'), ''), it.subject, 'Supplier email'),
                        nullif(trim(p_fields->>'supplier_ref'), ''));
    update public.purchase_orders
       set notes = left(concat_ws(E'\n', nullif(notes, ''), v_note), 4000),
           supplier_ref = coalesce(nullif(supplier_ref, ''), nullif(trim(p_fields->>'supplier_ref'), '')),
           expected_date = coalesce(nullif(p_fields->>'expected_date', '')::date, expected_date),
           updated_at = now()
     where id = v_po.id;
    update public.inbox_items set status = 'approved', purchase_order_id = v_po.id, reviewed_by = case when p_auto then null else p_actor end,
           reviewed_at = now(), auto_filed = p_auto, error = null where id = it.id;
    return jsonb_build_object('purchase_order_id', v_po.id);
  end if;
  raise exception 'Unknown action' using errcode = '22023';
end $$;
revoke execute on function private.inbox_file(uuid, text, jsonb, uuid, boolean) from public, anon, authenticated;

-- A person files an item they can see.
create or replace function public.file_inbox_item(p_id uuid, p_action text, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare it public.inbox_items;
begin
  select * into it from public.inbox_items where id = p_id;
  if not found or not private.can_see_inbox_item(it.team_id, it.source, it.owner_user_id) then
    raise exception 'Inbox item not found' using errcode = 'P0002';
  end if;
  return private.inbox_file(p_id, p_action, coalesce(p_fields, '{}'::jsonb), auth.uid(), false);
end $$;
revoke execute on function public.file_inbox_item(uuid, text, jsonb) from public, anon;
grant execute on function public.file_inbox_item(uuid, text, jsonb) to authenticated;

-- Approve as an expense (kept for the app's existing Approve button).
create or replace function public.approve_inbox_item(p_id uuid, p_fields jsonb)
returns public.expenses language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.file_inbox_item(p_id, 'expense', p_fields);
  return jsonb_populate_record(null::public.expenses, r);
end $$;

-- Reject or put back, for items the person can see.
create or replace function public.review_inbox_item(p_id uuid, p_action text)
returns public.inbox_items language plpgsql security definer set search_path = '' as $$
declare it public.inbox_items;
begin
  select * into it from public.inbox_items where id = p_id for update;
  if not found or not private.can_see_inbox_item(it.team_id, it.source, it.owner_user_id) then
    raise exception 'Inbox item not found' using errcode = 'P0002';
  end if;
  if it.status = 'approved' then
    raise exception 'This item has already been dealt with; change it where it was filed' using errcode = '42501';
  end if;
  if p_action = 'reject' then
    update public.inbox_items set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
     where id = p_id returning * into it;
  elsif p_action = 'restore' then
    update public.inbox_items
       set status = case when extracted = '{}'::jsonb then 'failed' else 'ready' end, reviewed_by = null, reviewed_at = null
     where id = p_id returning * into it;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  return it;
end $$;

-- ── Connections, for people ──
-- My mailboxes (managers see the company's), never the secrets.
create or replace function public.mail_connections(p_team uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'provider', c.provider, 'email', c.email, 'folder', c.folder, 'status', c.status,
           'last_error', c.last_error, 'last_run_at', c.last_run_at, 'last_found_at', c.last_found_at,
           'found_total', c.found_total, 'created_at', c.created_at, 'mine', c.user_id = auth.uid(),
           'owner_email', (select u.email from auth.users u where u.id = c.user_id))
         order by c.created_at), '[]'::jsonb)
    from private.mail_connections c
   where c.team_id = p_team and private.same_team(p_team)
     and (c.user_id = auth.uid() or private.is_team_manager(p_team));
$$;

-- Starting "Sign in with Microsoft/Google": a one-time state (15 minutes).
create or replace function public.mail_connect_start(p_team uuid, p_provider text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_state text;
begin
  if not private.same_team(p_team) then raise exception 'Not a member of this company' using errcode = '42501'; end if;
  if private.team_access(p_team) <> 'full' then raise exception 'Your company''s plan is read-only' using errcode = '42501'; end if;
  if p_provider not in ('microsoft', 'google') then raise exception 'Unknown mail provider' using errcode = '22023'; end if;
  delete from private.mail_oauth_states where created_at < now() - interval '15 minutes' or (team_id = p_team and user_id = auth.uid());
  v_state := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.mail_oauth_states (state, team_id, user_id, provider) values (v_state, p_team, auth.uid(), p_provider);
  return v_state;
end $$;

-- Pause, resume, change folder or disconnect: the mailbox's owner, or a manager.
create or replace function public.mail_connection_update(p_id uuid, p_action text, p_folder text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c private.mail_connections;
begin
  select * into c from private.mail_connections where id = p_id;
  if not found or not private.same_team(c.team_id) or not (c.user_id = auth.uid() or private.is_team_manager(c.team_id)) then
    raise exception 'Mailbox not found' using errcode = 'P0002';
  end if;
  if p_action = 'disconnect' then
    delete from private.mail_connections where id = p_id;
    delete from vault.secrets where id = c.secret_id;
  elsif p_action = 'pause' then
    update private.mail_connections set status = 'paused' where id = p_id;
  elsif p_action = 'resume' then
    update private.mail_connections set status = 'active', last_error = null where id = p_id;
  elsif p_action = 'folder' then
    if coalesce(trim(p_folder), '') = '' or length(p_folder) > 200 then raise exception 'Enter the folder name' using errcode = '22023'; end if;
    -- A different folder starts from its recent mail.
    update private.mail_connections set folder = trim(p_folder), cursor = null, status = 'active', last_error = null where id = p_id;
  else
    raise exception 'Unknown action' using errcode = '22023';
  end if;
end $$;

-- For "Check now": may this person run this mailbox?
create or replace function public.mail_can_run(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.mail_connections c
                  where c.id = p_id and private.same_team(c.team_id) and private.team_access(c.team_id) = 'full'
                    and (c.user_id = auth.uid() or private.is_team_manager(c.team_id)));
$$;

do $$
declare f text;
begin
  foreach f in array array['mail_connections(uuid)', 'mail_connect_start(uuid, text)',
                           'mail_connection_update(uuid, text, text)', 'mail_can_run(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ── For the mail-agent Edge Function only (service role) ──
create or replace function public.mail_take_state(p_state text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s private.mail_oauth_states;
begin
  delete from private.mail_oauth_states where state = p_state and created_at > now() - interval '15 minutes' returning * into s;
  if not found then return null; end if;
  return jsonb_build_object('team_id', s.team_id, 'user_id', s.user_id, 'provider', s.provider);
end $$;

create or replace function public.mail_save_connection(p_team uuid, p_user uuid, p_provider text, p_email text, p_secret text,
                                                       p_access text, p_expires_in int, p_imap_host text, p_imap_port int, p_folder text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c private.mail_connections; v_id uuid;
begin
  if not exists (select 1 from public.team_members where team_id = p_team and user_id = p_user) then
    raise exception 'Not a member of this company' using errcode = '42501';
  end if;
  select * into c from private.mail_connections
   where team_id = p_team and user_id = p_user and provider = p_provider and email = lower(trim(p_email));
  if found then
    perform vault.update_secret(c.secret_id, p_secret);
    update private.mail_connections
       set access_token = p_access, access_expires_at = now() + make_interval(secs => greatest(coalesce(p_expires_in, 0) - 60, 0)),
           imap_host = p_imap_host, imap_port = p_imap_port, folder = coalesce(nullif(trim(p_folder), ''), folder),
           status = 'active', last_error = null
     where id = c.id;
    return c.id;
  end if;
  insert into private.mail_connections (team_id, user_id, provider, email, folder, imap_host, imap_port, secret_id,
                                        access_token, access_expires_at)
  values (p_team, p_user, p_provider, lower(trim(p_email)), coalesce(nullif(trim(p_folder), ''), 'INBOX'), p_imap_host, p_imap_port,
          vault.create_secret(p_secret, 'mail_' || gen_random_uuid()::text, 'Mail agent credential'),
          p_access, now() + make_interval(secs => greatest(coalesce(p_expires_in, 0) - 60, 0)))
  returning id into v_id;
  return v_id;
end $$;

-- Mailboxes to check now (not checked in the last 4 minutes), with what the
-- agent needs: the secret, where it stopped, and the company's settings.
create or replace function public.mail_connections_due(p_limit int default 20, p_only uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select c.id, c.team_id, c.user_id, c.provider, c.email, c.folder, c.imap_host, c.imap_port, c.cursor,
           c.access_token, c.access_expires_at, c.created_at,
           (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.secret_id) as secret,
           t.owner_user_id,
           coalesce(tp.mail_agent_auto, false) as auto_file,
           coalesce(tp.mail_agent_kinds, array['expense', 'quote_request', 'customer_email', 'supplier_doc']) as kinds
      from private.mail_connections c
      join public.teams t on t.id = c.team_id
      left join public.team_profiles tp on tp.team_id = c.team_id
     where private.team_access(c.team_id) = 'full'
       and (p_only is not null and c.id = p_only
            or p_only is null and c.status = 'active' and (c.last_run_at is null or c.last_run_at < now() - interval '4 minutes'))
     order by c.last_run_at nulls first
     limit p_limit) x;
$$;

create or replace function public.mail_update_tokens(p_id uuid, p_access text, p_expires_in int, p_refresh text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secret uuid;
begin
  update private.mail_connections set access_token = p_access,
         access_expires_at = now() + make_interval(secs => greatest(coalesce(p_expires_in, 0) - 60, 0))
   where id = p_id returning secret_id into v_secret;
  if nullif(p_refresh, '') is not null then perform vault.update_secret(v_secret, p_refresh); end if;
end $$;

-- After a check: where it stopped, what it found, or what went wrong. Three
-- failures in a row (bad password, access removed) set it to "error" so it
-- isn't retried every 5 minutes; the person reconnects it.
create or replace function public.mail_mark_run(p_id uuid, p_cursor text, p_found int, p_error text)
returns void language sql security definer set search_path = '' as $$
  update private.mail_connections
     set cursor = coalesce(p_cursor, cursor), last_run_at = now(),
         found_total = found_total + coalesce(p_found, 0),
         last_found_at = case when coalesce(p_found, 0) > 0 then now() else last_found_at end,
         last_error = left(p_error, 500),
         status = case when p_error is null then 'active'
                       when p_error like 'AUTH:%' then 'error'
                       else status end
   where id = p_id;
$$;

-- The agent files an item by itself (company has auto-filing on), as the
-- mailbox's owner.
create or replace function public.mail_autofile(p_id uuid, p_action text, p_fields jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare it public.inbox_items;
begin
  select * into it from public.inbox_items where id = p_id;
  if not found or it.source <> 'mailbox' or it.owner_user_id is null then raise exception 'Not a mailbox item'; end if;
  return private.inbox_file(p_id, p_action, coalesce(p_fields, '{}'::jsonb), it.owner_user_id, true);
end $$;

do $$
declare f text;
begin
  foreach f in array array['mail_take_state(text)',
                           'mail_save_connection(uuid, uuid, text, text, text, text, int, text, int, text)',
                           'mail_connections_due(int, uuid)', 'mail_update_tokens(uuid, text, int, text)',
                           'mail_mark_run(uuid, text, int, text)', 'mail_autofile(uuid, text, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- A person leaving a company takes their mailbox with them.
create or replace function private.drop_mailboxes_on_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets where id in (select secret_id from private.mail_connections where team_id = old.team_id and user_id = old.user_id);
  delete from private.mail_connections where team_id = old.team_id and user_id = old.user_id;
  return old;
end $$;
drop trigger if exists team_members_drop_mailboxes on public.team_members;
create trigger team_members_drop_mailboxes after delete on public.team_members
  for each row execute function private.drop_mailboxes_on_leave();

-- ── Every 5 minutes, only while any mailbox is connected ──
do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-mail-agent') then
    perform cron.unschedule('powermate-mail-agent');
  end if;
  perform cron.schedule('powermate-mail-agent', '*/5 * * * *', $cmd$
    select net.http_post(
      url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/mail-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)),
      body := '{"action":"run"}'::jsonb,
      timeout_milliseconds := 150000)
    where exists (select 1 from private.mail_connections where status = 'active');
  $cmd$);
end $$;

-- ── Helpers for the mail-agent function ──
-- May this person add a mailbox for this company?
create or replace function public.mail_can_connect(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.same_team(p_team) and private.team_access(p_team) = 'full';
$$;
revoke execute on function public.mail_can_connect(uuid) from public, anon;
grant execute on function public.mail_can_connect(uuid) to authenticated;

-- The provider a sign-in state is for, if it's still valid and this person's.
create or replace function public.mail_state_provider(p_state text, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select provider from private.mail_oauth_states
   where state = p_state and user_id = p_user and created_at > now() - interval '15 minutes';
$$;
-- The company's people's addresses (mail among them is internal).
create or replace function public.mail_team_emails(p_team uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(lower(u.email)), '{}') from public.team_members m join auth.users u on u.id = m.user_id
   where m.team_id = p_team and u.email is not null;
$$;
do $$
declare f text;
begin
  foreach f in array array['mail_state_provider(text, uuid)', 'mail_team_emails(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
