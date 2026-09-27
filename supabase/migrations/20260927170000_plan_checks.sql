-- ── Daily plan checks ────────────────────────────────────────────────────────
-- So the platform owner doesn't have to watch dates:
--   * 3 days before a trial ends, the company's master account is told (in the
--     app) to choose a plan;
--   * on the day a paid plan's "paid until" date passes, the master account
--     is told payment is due; after 7 days' grace the company becomes past due
--     (read-only: they can view and export, not add or change) until the
--     platform owner records the payment (Platform → company → paid until,
--     status active).
-- Free plans and companies without a "paid until" date are never touched.
alter table public.reminder_log drop constraint if exists reminder_log_kind_check;
alter table public.reminder_log add constraint reminder_log_kind_check
  check (kind in ('invoice_overdue', 'quote_chase', 'service_due', 'low_stock', 'customer_invoice_email',
                  'trial_ending', 'plan_payment_due', 'plan_past_due'));

create or replace function private.daily_plan_checks() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  n_trial int := 0; n_due int := 0; n_past int := 0;
begin
  -- Trials ending within 3 days.
  for r in
    select tp.team_id, t.owner_user_id, tp.trial_ends_at
      from public.team_plans tp join public.teams t on t.id = tp.team_id
     where tp.plan = 'trial' and tp.status = 'active' and tp.trial_ends_at between now() and now() + interval '3 days'
  loop
    if private.remind_once(r.team_id, 'trial_ending', r.team_id, (r.trial_ends_at::date - date '2000-01-01')) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      values (r.team_id, r.owner_user_id, r.owner_user_id, 'plan', r.team_id, 'Your trial',
              format('Your free trial ends on %s. After that the app is read-only until you choose a plan: use Help & support to get in touch.',
                     to_char(r.trial_ends_at, 'DD Mon YYYY')));
      n_trial := n_trial + 1;
    end if;
  end loop;

  -- Paid plans whose "paid until" date has passed.
  for r in
    select tp.team_id, t.owner_user_id, tp.paid_until, current_date - tp.paid_until::date as days
      from public.team_plans tp join public.teams t on t.id = tp.team_id
     where tp.plan in ('starter', 'pro', 'enterprise') and tp.status = 'active'
       and tp.paid_until is not null and tp.paid_until::date < current_date
  loop
    if r.days >= 7 then
      update public.team_plans set status = 'past_due' where team_id = r.team_id and status = 'active';
      if private.remind_once(r.team_id, 'plan_past_due', r.team_id, (r.paid_until::date - date '2000-01-01')) then
        insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
        values (r.team_id, r.owner_user_id, r.owner_user_id, 'plan', r.team_id, 'Subscription',
                'Your subscription payment is overdue, so the app is read-only for now. Everything is kept safe; it opens again as soon as payment is received.');
      end if;
      n_past := n_past + 1;
    elsif private.remind_once(r.team_id, 'plan_payment_due', r.team_id, (r.paid_until::date - date '2000-01-01')) then
      insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message)
      values (r.team_id, r.owner_user_id, r.owner_user_id, 'plan', r.team_id, 'Subscription',
              format('Your subscription was paid until %s. Please pay within 7 days to keep full use of the app.', to_char(r.paid_until, 'DD Mon YYYY')));
      n_due := n_due + 1;
    end if;
  end loop;

  return jsonb_build_object('trial_ending', n_trial, 'payment_due', n_due, 'past_due', n_past);
end $$;
revoke execute on function private.daily_plan_checks() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'powermate-plan-checks') then
    perform cron.unschedule('powermate-plan-checks');
  end if;
  -- 05:05 UTC = 07:05 in South Africa.
  perform cron.schedule('powermate-plan-checks', '5 5 * * *', 'select private.daily_plan_checks();');
end $$;
