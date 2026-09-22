-- Exported from production supabase_migrations.schema_migrations (20260915092223).
DROP POLICY IF EXISTS users_read_policy ON public.users;
CREATE POLICY users_read_policy ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
