-- send-reminders claims each reminder here before pushing it, so overlapping or
-- retried cron runs never deliver the same reminder twice. Written only by the
-- Edge Function (service role): RLS on with no policies = no client access.
create table if not exists public.reminder_deliveries (
  key text primary key,          -- e.g. fu:<id>:<fire time>, digest:<user>:<date>
  user_id uuid,
  kind text not null,
  sent_at timestamptz not null default now()
);
create index if not exists reminder_deliveries_sent_at_idx on public.reminder_deliveries (sent_at);
alter table public.reminder_deliveries enable row level security;
revoke all on public.reminder_deliveries from anon, authenticated;
comment on table public.reminder_deliveries is
  'Delivery log for the send-reminders Edge Function (service role only). Rows older than 30 days are pruned by the function.';

-- pg_net gives up after 5 s by default, which a cold-starting Edge Function can
-- exceed; allow 30 s so a slow run is not cut off mid-send.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'powermate-followup-reminders'),
  command := $cmd$
  select net.http_post(
    url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);
