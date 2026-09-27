-- ── Overdue-invoice emails to customers ───────────────────────────────────────
-- For companies that switched on "Email customers about overdue invoices",
-- the customer-reminders edge function (daily, pg_cron) asks for the emails due
-- today, sends them, and marks each one sent. One email per invoice at 1, 7,
-- 14 and 30 days overdue, with the customer's portal link.

-- The emails due now (service role only). Makes a portal link for clients
-- that don't have one yet.
create or replace function public.customer_reminder_batch() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_stage int;
  v_token text;
  out jsonb := '[]'::jsonb;
begin
  for r in
    select i.id, i.team_id, i.invoice_number, i.due_date, coalesce(i.balance_due, i.total) as balance,
           current_date - i.due_date as days, c.id as client_id, c.email, c.contact, c.company,
           coalesce(tp.trading_name, tp.legal_name) as company_name, coalesce(tp.finance_email, tp.email) as reply_to
      from public.invoices i
      join public.team_profiles tp on tp.team_id = i.team_id and tp.email_customer_reminders
      join public.clients c on c.id = i.client_id
     where i.due_date < current_date and i.due_date > current_date - 120
       and coalesce(i.balance_due, i.total) > 0 and coalesce(i.status, '') not in ('paid', 'draft', 'cancelled', 'void')
       and i.invoice_number !~ '^INV-\d{4}-\d{6,7}$'
       and c.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
       and private.team_access(i.team_id) = 'full'
     limit 500
  loop
    v_stage := case when r.days >= 30 then 30 when r.days >= 14 then 14 when r.days >= 7 then 7 else 1 end;
    continue when exists (select 1 from public.reminder_log l where l.kind = 'customer_invoice_email' and l.record_id = r.id and l.stage = v_stage);
    select token into v_token from public.client_portal_links where client_id = r.client_id and revoked_at is null;
    if v_token is null then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      insert into public.client_portal_links (team_id, client_id, token) values (r.team_id, r.client_id, v_token);
    end if;
    out := out || jsonb_build_object('invoice_id', r.id, 'team_id', r.team_id, 'stage', v_stage, 'to', r.email,
      'contact', r.contact, 'client', r.company, 'invoice_number', r.invoice_number, 'balance', r.balance,
      'due_date', r.due_date, 'days', r.days, 'company', r.company_name, 'reply_to', r.reply_to, 'portal_token', v_token);
  end loop;
  return out;
end $$;

create or replace function public.customer_reminder_sent(p_invoice_id uuid, p_team_id uuid, p_stage int) returns void
language sql security definer set search_path = '' as $$
  insert into public.reminder_log (team_id, kind, record_id, stage) values (p_team_id, 'customer_invoice_email', p_invoice_id, p_stage)
  on conflict (kind, record_id, stage) do nothing;
$$;

revoke execute on function public.customer_reminder_batch() from public, anon, authenticated;
revoke execute on function public.customer_reminder_sent(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.customer_reminder_batch() to service_role;
grant execute on function public.customer_reminder_sent(uuid, uuid, int) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-customer-reminders') then
    perform cron.unschedule('powermate-customer-reminders');
  end if;
  -- 06:40 UTC = 08:40 in South Africa.
  perform cron.schedule('powermate-customer-reminders', '40 6 * * *', $cmd$
    select net.http_post(
      url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/customer-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)),
      body := '{}'::jsonb);
  $cmd$);
end $$;
