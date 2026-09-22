-- Exported from production supabase_migrations.schema_migrations (20260916034154).
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON public.calendar_events (client_id);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to_user_id ON public.clients (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to_user_id ON public.contacts (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_followups_assigned_to_user_id ON public.followups (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_followups_linked_note_id ON public.followups (linked_note_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON public.invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON public.invoices (quote_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON public.jobs (client_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to_user_id ON public.leads (assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON public.leads (contact_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id ON public.notification_log (user_id);
CREATE INDEX IF NOT EXISTS idx_service_reports_client_id ON public.service_reports (client_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_from_user_id ON public.team_notifications (from_user_id);
CREATE INDEX IF NOT EXISTS idx_team_notifications_team_id ON public.team_notifications (team_id);
DROP INDEX IF EXISTS public.idx_jobs_quote_id_unique;
DROP INDEX IF EXISTS public.jobs_quote_id_unique_idx;
DROP INDEX IF EXISTS public.idx_push_subs_user_id;
