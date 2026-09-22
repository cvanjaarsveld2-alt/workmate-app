-- Exported from production supabase_migrations.schema_migrations (20260915110723).
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;
GRANT SELECT ON TABLE public.users TO authenticated;

DROP POLICY IF EXISTS "users_read_own" ON public.users;
DROP POLICY IF EXISTS "users_read_authenticated" ON public.users;
CREATE POLICY "users_read_own" ON public.users
FOR SELECT TO authenticated
USING (auth.uid() = id);
