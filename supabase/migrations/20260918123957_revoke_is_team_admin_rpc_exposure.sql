-- Exported from production supabase_migrations.schema_migrations (20260918123957).
-- is_team_admin() is an internal RLS helper (used only inside team_members_update/
-- team_members_delete policies, added in 20260918134000). It was never meant to be
-- called directly — Supabase auto-exposes every public-schema function as a
-- /rest/v1/rpc/ endpoint regardless of intent. Confirmed via grep: no frontend code
-- calls it as an RPC. It's harmless if called directly (returns a boolean, no side
-- effects, already scoped to auth.uid()), but there's no reason to leave it exposed.
-- Same fix already applied to events_set_owner_and_validate() for the same reason.
revoke execute on function public.is_team_admin(uuid) from anon, authenticated, public;
