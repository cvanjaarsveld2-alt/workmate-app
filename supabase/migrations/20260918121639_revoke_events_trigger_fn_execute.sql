-- Exported from production supabase_migrations.schema_migrations (20260918121639).
-- The trigger function shouldn't be directly RPC-callable (Postgres would
-- reject a direct call anyway — trigger functions can only run as triggers —
-- but Supabase auto-exposes every public.* function via PostgREST, and the
-- advisor is right to flag that as unnecessary surface). Revoke EXECUTE from
-- the client-facing roles; the trigger mechanism itself doesn't need it
-- (triggers run as the table owner, not through role-based EXECUTE grants).
revoke execute on function public.events_set_owner_and_validate() from anon, authenticated, public;
