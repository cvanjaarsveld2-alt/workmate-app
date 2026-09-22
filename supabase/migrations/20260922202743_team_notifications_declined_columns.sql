-- Exported from production supabase_migrations.schema_migrations (20260922202743).
-- SharedInboxScreen filters on declined IS NULL and writes declined/declined_at,
-- but the columns never existed, so the inbox query failed (42703).
alter table public.team_notifications add column if not exists declined boolean;
alter table public.team_notifications add column if not exists declined_at timestamptz;
