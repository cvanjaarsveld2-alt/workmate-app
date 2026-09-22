-- Exported from production supabase_migrations.schema_migrations (20260915121953).
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS from_user_id uuid;
COMMENT ON COLUMN public.followups.from_user_id IS 'Optional originating user for shared/assigned follow-up records; nullable for legacy records.';
