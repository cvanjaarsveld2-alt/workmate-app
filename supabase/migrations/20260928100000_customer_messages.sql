-- ── WhatsApp & SMS to customers ───────────────────────────────────────────────
-- Messages a company sends its customers: "booking confirmed", "on my way",
-- "job done", "your invoice", "service due" and one-off messages.
--
--   WhatsApp: sent by the technician from their own phone (the app opens
--     WhatsApp with the message ready). Free; logged here as 'opened'.
--   SMS: sent by the platform through its SMS provider (Platform → Messages):
--     automatically when a job is booked or finished (if the company switched
--     that on), or when someone taps "Send SMS". Queued here, sent by the
--     send-messages edge function (every 2 minutes), with a monthly limit per
--     company so a mistake can't run up the platform's SMS bill.
--
-- Each company can reword the messages (Company Details → Customer messages).
-- Plan feature: messages (Pro and Enterprise).

alter table public.team_profiles add column if not exists message_templates jsonb not null default '{}'::jsonb;
alter table public.team_profiles add column if not exists auto_sms jsonb not null default '{}'::jsonb;

create table if not exists public.customer_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid(),
  client_id uuid references public.clients(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'sms')),
  kind text not null default 'custom' check (kind in ('booking', 'on_my_way', 'done', 'invoice', 'quote', 'service_due', 'custom')),
  to_phone text not null check (to_phone ~ '^\+?[0-9]{9,15}$'),
  body text not null check (length(body) between 1 and 1000),
  status text not null default 'queued' check (status in ('opened', 'queued', 'sending', 'sent', 'failed', 'skipped')),
  error text check (length(error) <= 300),
  provider_ref text check (length(provider_ref) <= 120),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists customer_messages_team_idx on public.customer_messages (team_id, created_at desc);
create index if not exists customer_messages_queue_idx on public.customer_messages (created_at) where status = 'queued';
create index if not exists customer_messages_client_idx on public.customer_messages (client_id, created_at desc) where client_id is not null;

alter table public.customer_messages enable row level security;
drop policy if exists customer_messages_select on public.customer_messages;
drop policy if exists customer_messages_insert on public.customer_messages;
drop policy if exists customer_messages_plan_read on public.customer_messages;
drop policy if exists customer_messages_plan_insert on public.customer_messages;
drop policy if exists customer_messages_plan_feature on public.customer_messages;
create policy customer_messages_select on public.customer_messages for select to authenticated using (private.same_team(team_id));
-- Anyone in the company can log a WhatsApp message or queue an SMS; nobody
-- can mark one sent (only the send-messages function does that).
create policy customer_messages_insert on public.customer_messages for insert to authenticated
  with check (private.same_team(team_id) and user_id = auth.uid()
              -- 'skipped' is set by customer_messages_check (SMS off, or over the monthly limit).
              and ((channel = 'whatsapp' and status = 'opened') or (channel = 'sms' and status in ('queued', 'skipped')))
              and provider_ref is null and sent_at is null);
create policy customer_messages_plan_read on public.customer_messages as restrictive for select to authenticated
  using (private.team_access(team_id) <> 'suspended');
create policy customer_messages_plan_insert on public.customer_messages as restrictive for insert to authenticated
  with check (private.team_access(team_id) = 'full');
create policy customer_messages_plan_feature on public.customer_messages as restrictive for insert to authenticated
  with check (private.team_has_feature(team_id, 'messages'));
revoke all on public.customer_messages from anon;
revoke update, delete on public.customer_messages from authenticated;
grant select, insert on public.customer_messages to authenticated;

-- ── The platform's SMS provider (Platform → Messages) ──
create table if not exists private.platform_sms (
  id boolean primary key default true check (id),
  provider text not null default 'bulksms' check (provider in ('bulksms', 'twilio')),
  username text check (length(username) <= 120),   -- BulkSMS token id / Twilio account SID
  secret text check (length(secret) <= 200),       -- BulkSMS token secret / Twilio auth token
  sender text check (length(sender) <= 20),        -- sender ID / Twilio number
  monthly_limit integer not null default 300 check (monthly_limit between 0 and 100000),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on private.platform_sms from public, anon, authenticated;

create or replace function private.admin_set_sms(p_provider text, p_username text, p_secret text, p_sender text,
                                                 p_monthly_limit integer, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s private.platform_sms;
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  insert into private.platform_sms as x (id, provider, username, secret, sender, monthly_limit, enabled)
  values (true, coalesce(p_provider, 'bulksms'), nullif(trim(p_username), ''), nullif(p_secret, ''), nullif(trim(p_sender), ''),
          coalesce(p_monthly_limit, 300), coalesce(p_enabled, false))
  on conflict (id) do update set
    provider = coalesce(p_provider, x.provider),
    username = coalesce(nullif(trim(p_username), ''), x.username),
    secret = coalesce(nullif(p_secret, ''), x.secret),
    sender = case when p_sender is null then x.sender else nullif(trim(p_sender), '') end,
    monthly_limit = coalesce(p_monthly_limit, x.monthly_limit),
    enabled = coalesce(p_enabled, x.enabled),
    updated_at = now()
  returning * into s;
  if s.enabled and (s.username is null or s.secret is null) then
    raise exception 'Enter the provider''s username (or account SID) and secret before switching SMS on';
  end if;
  if s.enabled and s.provider = 'twilio' and s.sender is null then raise exception 'Twilio needs the number to send from'; end if;
  return jsonb_build_object('provider', s.provider, 'username', s.username, 'has_secret', s.secret is not null,
                            'sender', s.sender, 'monthly_limit', s.monthly_limit, 'enabled', s.enabled);
end $$;
create or replace function private.admin_get_sms() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Not authorized'; end if;
  return coalesce((select jsonb_build_object('provider', s.provider, 'username', s.username, 'has_secret', s.secret is not null,
                                             'sender', s.sender, 'monthly_limit', s.monthly_limit, 'enabled', s.enabled,
                                             'sent_this_month', (select count(*) from public.customer_messages m
                                                                  where m.channel = 'sms' and m.status = 'sent'
                                                                    and m.created_at >= date_trunc('month', now())))
                     from private.platform_sms s),
                  jsonb_build_object('provider', 'bulksms', 'has_secret', false, 'monthly_limit', 300, 'enabled', false, 'sent_this_month', 0));
end $$;

-- Can this company send SMS now, and how many are left this month?
create or replace function private.sms_status(p_team_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'available', coalesce(s.enabled, false) and private.same_team(p_team_id) and private.team_has_feature(p_team_id, 'messages'),
    'limit', coalesce(s.monthly_limit, 0),
    'used', (select count(*) from public.customer_messages m
              where m.team_id = p_team_id and m.channel = 'sms' and m.status in ('queued', 'sending', 'sent')
                and m.created_at >= date_trunc('month', now())))
  from (select true) x left join private.platform_sms s on true;
$$;

do $$
declare f text;
begin
  foreach f in array array['admin_set_sms(text, text, text, text, integer, boolean)', 'admin_get_sms()', 'sms_status(uuid)'] loop
    execute format('revoke execute on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end $$;
create or replace function public.admin_set_sms(p_provider text, p_username text, p_secret text, p_sender text,
                                                p_monthly_limit integer, p_enabled boolean) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.admin_set_sms(p_provider, p_username, p_secret, p_sender, p_monthly_limit, p_enabled);
$$;
create or replace function public.admin_get_sms() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.admin_get_sms(); $$;
create or replace function public.sms_status(p_team_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.sms_status(p_team_id); $$;
do $$
declare f text;
begin
  foreach f in array array['admin_set_sms(text, text, text, text, integer, boolean)', 'admin_get_sms()', 'sms_status(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Over the monthly limit, or SMS switched off: the queued message is skipped
-- (and says why) instead of sent.
create or replace function private.customer_messages_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer; v_used integer; v_on boolean;
begin
  if new.channel <> 'sms' or new.status <> 'queued' then return new; end if;
  select enabled, monthly_limit into v_on, v_limit from private.platform_sms;
  if not coalesce(v_on, false) then
    new.status := 'skipped'; new.error := 'SMS isn''t switched on for the platform';
    return new;
  end if;
  select count(*) into v_used from public.customer_messages
   where team_id = new.team_id and channel = 'sms' and status in ('queued', 'sending', 'sent')
     and created_at >= date_trunc('month', now());
  if v_used >= v_limit then
    new.status := 'skipped'; new.error := format('This month''s %s SMS have been used', v_limit);
  end if;
  return new;
end $$;
revoke execute on function private.customer_messages_check() from public, anon, authenticated;
drop trigger if exists customer_messages_check on public.customer_messages;
create trigger customer_messages_check before insert on public.customer_messages
  for each row execute function private.customer_messages_check();

-- ── The wording (the app's src/lib/messages.js has the same defaults) ──
create or replace function private.message_default(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'booking' then 'Hi {client}, {company} has booked your job "{job}" for {date}{time}. Reply to this message if that doesn''t suit you.'
    when 'on_my_way' then 'Hi {client}, {technician} from {company} is on the way to you now.'
    when 'done' then 'Hi {client}, {company} has finished the job "{job}". Thank you for your business.{link}'
    when 'invoice' then 'Hi {client}, here is invoice {invoice} from {company} for {amount}. You can view and pay it here: {link}'
    when 'quote' then 'Hi {client}, here is our quote {quote} for {amount}. You can view and accept it here: {link}'
    when 'service_due' then 'Hi {client}, your {equipment} is due for its service. Reply to book a time with {company}.'
    else '' end;
$$;

-- Fills in {client}, {company}, {job}, {date}, {time}, {technician}, {link}.
create or replace function private.job_message(p_job public.jobs, p_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_client public.clients;
  v_profile public.team_profiles;
  v_text text;
  v_phone text;
  v_link text;
begin
  if p_job.client_id is null then return null; end if;
  select * into v_client from public.clients where id = p_job.client_id and team_id = p_job.team_id;
  if not found then return null; end if;
  v_phone := regexp_replace(coalesce(v_client.phone, ''), '[^0-9+]', '', 'g');
  if v_phone ~ '^0[0-9]{9}$' then v_phone := '+27' || substr(v_phone, 2); end if;
  if v_phone ~ '^27[0-9]{9}$' then v_phone := '+' || v_phone; end if;
  if v_phone !~ '^\+[0-9]{9,15}$' then return null; end if;
  select * into v_profile from public.team_profiles where team_id = p_job.team_id;
  v_text := coalesce(nullif(v_profile.message_templates ->> p_kind, ''), private.message_default(p_kind));
  if p_kind = 'done' then
    select ' See your account and invoices: ' || '{app}/?portal=' || token into v_link
      from public.client_portal_links where client_id = v_client.id and revoked_at is null
     order by created_at desc limit 1;
  end if;
  v_text := replace(v_text, '{client}', coalesce(nullif(split_part(trim(coalesce(v_client.contact, '')), ' ', 1), ''), v_client.company, 'there'));
  v_text := replace(v_text, '{company}', coalesce(v_profile.trading_name, v_profile.legal_name, ''));
  v_text := replace(v_text, '{job}', coalesce(p_job.title, p_job.job_number, 'your job'));
  v_text := replace(v_text, '{date}', coalesce(to_char(p_job.scheduled_date, 'Dy DD Mon'), 'soon'));
  v_text := replace(v_text, '{time}', coalesce(' at ' || to_char(p_job.scheduled_time, 'HH24:MI'), ''));
  v_text := replace(v_text, '{technician}', coalesce(nullif(split_part(trim(coalesce(p_job.assigned_to, '')), ' ', 1), ''), 'our technician'));
  v_text := replace(v_text, '{link}', coalesce(v_link, ''));
  return jsonb_build_object('to', v_phone, 'body', left(v_text, 1000));
end $$;
revoke execute on function private.job_message(public.jobs, text) from public, anon, authenticated;

-- Automatic SMS when a job is booked (or moved) and when it's finished.
create or replace function private.job_auto_sms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_auto jsonb;
  v_kind text;
  v_msg jsonb;
begin
  if new.team_id is null or new.client_id is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.scheduled_date is not null and new.status = 'scheduled' then v_kind := 'booking'; end if;
  else
    if new.status = 'completed' and old.status is distinct from 'completed' then v_kind := 'done';
    elsif new.status = 'scheduled' and new.scheduled_date is not null
      and (old.scheduled_date is distinct from new.scheduled_date or old.scheduled_time is distinct from new.scheduled_time) then v_kind := 'booking';
    end if;
  end if;
  if v_kind is null then return new; end if;
  select auto_sms into v_auto from public.team_profiles where team_id = new.team_id;
  if not coalesce((v_auto ->> v_kind)::boolean, false) then return new; end if;
  if not private.team_has_feature(new.team_id, 'messages') or private.team_access(new.team_id) <> 'full' then return new; end if;
  v_msg := private.job_message(new, v_kind);
  if v_msg is null then return new; end if;
  insert into public.customer_messages (team_id, user_id, client_id, job_id, channel, kind, to_phone, body, status)
  values (new.team_id, auth.uid(), new.client_id, new.id, 'sms', v_kind, v_msg ->> 'to', v_msg ->> 'body', 'queued');
  return new;
end $$;
revoke execute on function private.job_auto_sms() from public, anon, authenticated;
drop trigger if exists jobs_auto_sms on public.jobs;
create trigger jobs_auto_sms after insert or update of status, scheduled_date, scheduled_time on public.jobs
  for each row execute function private.job_auto_sms();

-- ── For the send-messages function (service role only) ──
create or replace function public.sms_gateway() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) - 'id' from private.platform_sms s where s.enabled;
$$;
-- Takes up to p_limit queued messages (oldest first) and marks them 'sending'.
create or replace function public.messages_claim(p_limit integer) returns setof public.customer_messages
language sql security definer set search_path = '' as $$
  update public.customer_messages m set status = 'sending'
   where m.id in (select id from public.customer_messages where status = 'queued' order by created_at
                  limit least(greatest(coalesce(p_limit, 20), 1), 100) for update skip locked)
  returning m.*;
$$;
create or replace function public.message_result(p_id uuid, p_ok boolean, p_ref text, p_error text) returns void
language sql security definer set search_path = '' as $$
  update public.customer_messages
     set status = case when p_ok then 'sent' else 'failed' end,
         provider_ref = left(p_ref, 120), error = left(p_error, 300),
         sent_at = case when p_ok then now() else null end
   where id = p_id and status = 'sending';
$$;
do $$
declare f text;
begin
  foreach f in array array['sms_gateway()', 'messages_claim(integer)', 'message_result(uuid, boolean, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Every 2 minutes, send what's queued (nothing happens until SMS is set up).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-send-messages') then
    perform cron.unschedule('powermate-send-messages');
  end if;
  perform cron.schedule('powermate-send-messages', '*/2 * * * *', $cmd$
    select net.http_post(
      url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/send-messages',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)),
      body := '{}'::jsonb)
    where exists (select 1 from public.customer_messages where status = 'queued');
  $cmd$);
end $$;

-- ── Company export / deletion, and the two-company isolation test ──
create or replace function private.company_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array['customer_messages','purchase_orders','suppliers','reminder_log','client_portal_links','stock_movements','products',
               'time_entries','payments','invoices','jobs','service_plans','repair_reports','breakdown_reports','followups','notes',
               'activities','leads','equipment','quotes','contacts','expenses','vehicle_checks','custom_faults','company_documents',
               'machine_jack_confirmations','team_notifications','billing_payments','clients']::text[];
$$;
do $$
declare d text;
begin
  d := pg_get_functiondef('private.tenant_isolation_test()'::regprocedure);
  if position('''customer_messages''' in d) = 0 then
    d := replace(d, '''suppliers'',''purchase_orders''];', '''suppliers'',''purchase_orders'',''customer_messages''];');
    if position('''customer_messages''' in d) = 0 then raise exception 'isolation test patch did not apply'; end if;
    execute d;
  end if;
end $$;
