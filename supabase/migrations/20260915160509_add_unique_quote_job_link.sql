-- Exported from production supabase_migrations.schema_migrations (20260915160509).
create unique index if not exists jobs_quote_id_unique on public.jobs (quote_id) where quote_id is not null;
