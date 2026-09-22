-- Exported from production supabase_migrations.schema_migrations (20260919110714).

-- RLS policies call private.same_team directly. The helper itself is a
-- SECURITY DEFINER function with a caller-bound auth.uid() check, so it must
-- be executable by the authenticated role for those policies to evaluate.
grant usage on schema private to authenticated;
revoke execute on function private.same_team(uuid) from public, anon;
grant execute on function private.same_team(uuid) to authenticated;

-- Private implementations should not be directly executable by API roles;
-- public wrappers are the intended client entry points.
revoke execute on function private.get_team_member_emails(uuid) from public, anon, authenticated;
