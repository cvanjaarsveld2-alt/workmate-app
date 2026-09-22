-- Exported from production supabase_migrations.schema_migrations (20260918143114).
drop index if exists public.jobs_quote_id_unique;
create index if not exists idx_email_quotes_matched_client_id on public.email_quotes(matched_client_id);
create index if not exists idx_email_quotes_promoted_quote_id on public.email_quotes(promoted_quote_id);
create index if not exists idx_events_user_id on public.events(user_id);
