-- Exported from production supabase_migrations.schema_migrations (20260916143238).
DO $$
DECLARE p record; q text; w text; stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname='public'
      AND (coalesce(qual,'') ~ 'auth\.(uid|jwt|role)\(\)' OR coalesce(with_check,'') ~ 'auth\.(uid|jwt|role)\(\)' OR coalesce(qual,'') ~ 'current_setting\(' OR coalesce(with_check,'') ~ 'current_setting\(')
  LOOP
    q := p.qual; w := p.with_check;
    IF q IS NOT NULL THEN
      q := regexp_replace(q, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      q := regexp_replace(q, 'auth\.jwt\(\)', '(select auth.jwt())', 'g');
      q := regexp_replace(q, 'auth\.role\(\)', '(select auth.role())', 'g');
      q := regexp_replace(q, 'current_setting\(([^\)]*)\)', '(select current_setting(\1))', 'g');
    END IF;
    IF w IS NOT NULL THEN
      w := regexp_replace(w, 'auth\.uid\(\)', '(select auth.uid())', 'g');
      w := regexp_replace(w, 'auth\.jwt\(\)', '(select auth.jwt())', 'g');
      w := regexp_replace(w, 'auth\.role\(\)', '(select auth.role())', 'g');
      w := regexp_replace(w, 'current_setting\(([^\)]*)\)', '(select current_setting(\1))', 'g');
    END IF;
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
    IF w IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', w); END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
