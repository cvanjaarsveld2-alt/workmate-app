-- Exported from production supabase_migrations.schema_migrations (20260915171148).
alter table public.jobs add column if not exists sync_status text default 'synced'; alter table public.invoices add column if not exists sync_status text default 'synced'; alter table public.payments add column if not exists sync_status text default 'synced';
