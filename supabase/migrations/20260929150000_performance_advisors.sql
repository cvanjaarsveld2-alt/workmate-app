-- Performance advisor fixes.
-- 1. RLS policies that called auth.uid() per row now call it once per query
--    ((select auth.uid()) is planned as an init-plan). Same rules as before.
-- 2. Indexes for foreign keys that had none, so deletes on the parent and
--    joins on the child don't scan the whole table.

alter policy customer_messages_insert on public.customer_messages
  with check (
    private.same_team(team_id)
    and user_id = (select auth.uid())
    and ((channel = 'whatsapp' and status = 'opened')
         or (channel = 'sms' and status = any (array['queued', 'skipped'])))
    and provider_ref is null
    and sent_at is null
  );

alter policy form_submissions_insert on public.form_submissions
  with check (private.same_team(team_id) and user_id = (select auth.uid()));

alter policy tech_locations_insert on public.tech_locations
  with check (
    private.same_team(team_id)
    and user_id = (select auth.uid())
    and private.location_sharing_on(team_id)
    and recorded_at > now() - interval '1 hour'
    and recorded_at < now() + interval '5 minutes'
  );

alter policy tech_locations_select on public.tech_locations
  using (
    private.same_team(team_id)
    and (user_id = (select auth.uid()) or private.is_team_manager(team_id))
  );

create index if not exists xero_oauth_states_team_idx on private.xero_oauth_states (team_id);
create index if not exists billing_payments_team_idx on public.billing_payments (team_id);
create index if not exists client_portal_links_team_idx on public.client_portal_links (team_id);
create index if not exists credit_notes_client_idx on public.credit_notes (client_id);
create index if not exists customer_messages_invoice_idx on public.customer_messages (invoice_id);
create index if not exists customer_messages_job_idx on public.customer_messages (job_id);
create index if not exists form_submissions_client_idx on public.form_submissions (client_id);
create index if not exists form_submissions_template_idx on public.form_submissions (template_id);
create index if not exists machine_jack_confirmations_user_idx on public.machine_jack_confirmations (user_id);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index if not exists quotes_revision_of_idx on public.quotes (revision_of);
create index if not exists quotes_superseded_by_idx on public.quotes (superseded_by);
create index if not exists reminder_log_team_idx on public.reminder_log (team_id);
create index if not exists service_plans_assigned_to_idx on public.service_plans (assigned_to_user_id);
create index if not exists service_plans_client_idx on public.service_plans (client_id);
create index if not exists service_plans_equipment_idx on public.service_plans (equipment_id);
create index if not exists stock_movements_team_idx on public.stock_movements (team_id);
create index if not exists support_tickets_team_idx on public.support_tickets (team_id);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id);
create index if not exists teams_owner_user_idx on public.teams (owner_user_id);
create index if not exists tech_locations_job_idx on public.tech_locations (job_id);
