-- Shared secret pg_cron presents to send-reminders (never leaves the database).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'powermate_cron_secret') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'powermate_cron_secret',
      'Presented by pg_cron to the send-reminders Edge Function');
  end if;
end $$;

-- Lets the Edge Function verify the header without ever reading the secret.
create or replace function public.cron_secret_matches(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'powermate_cron_secret' and decrypted_secret = p_secret
  );
$$;
revoke all on function public.cron_secret_matches(text) from public, anon, authenticated;
grant execute on function public.cron_secret_matches(text) to service_role;

-- Retire the three broken jobs: check-reminders sent no auth (vault key missing)
-- and read legacy tables; the daily digest called send-notifications without a
-- recipient; powermate-reminders failed on a missing app.supabase_url setting.
select cron.unschedule(jobid) from cron.job
where jobname in ('check-reminders-every-5-min', 'powermate-daily-digest', 'powermate-reminders');

select cron.schedule(
  'powermate-followup-reminders',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://hrqzqyfvbfzrfnuxovvr.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'powermate_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);
