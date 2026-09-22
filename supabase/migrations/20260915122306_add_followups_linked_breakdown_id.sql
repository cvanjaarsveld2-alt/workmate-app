-- Exported from production supabase_migrations.schema_migrations (20260915122306).
alter table public.followups add column if not exists linked_breakdown_id uuid;
