-- Exported from production supabase_migrations.schema_migrations (20260916143350).
REVOKE EXECUTE ON FUNCTION public.restore_sync_dependencies() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.stage_missing_sync_dependencies() FROM authenticated, anon;
