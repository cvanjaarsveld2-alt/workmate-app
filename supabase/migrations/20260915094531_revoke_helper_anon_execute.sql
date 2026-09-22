-- Exported from production supabase_migrations.schema_migrations (20260915094531).
REVOKE EXECUTE ON FUNCTION public.current_team_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.same_team(uuid) FROM anon;
