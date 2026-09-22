-- Exported from production supabase_migrations.schema_migrations (20260915122500).
alter table public.followups add column if not exists to_user_id uuid;
