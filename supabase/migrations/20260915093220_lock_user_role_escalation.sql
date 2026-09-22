-- Exported from production supabase_migrations.schema_migrations (20260915093220).
-- Prevent clients from changing their own authorization role.
-- The app creates user profiles through the auth trigger; normal clients do not
-- need direct INSERT/UPDATE/DELETE access to public.users.
DROP POLICY IF EXISTS users_policy ON public.users;
DROP POLICY IF EXISTS users_read_policy ON public.users;

CREATE POLICY users_read_own
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- No client INSERT/UPDATE/DELETE policies are created intentionally.
-- Service-role/admin server operations remain able to manage this table.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM anon, authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;
