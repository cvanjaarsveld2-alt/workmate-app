-- Exported from production supabase_migrations.schema_migrations (20260915094519).
-- Harden remaining SECURITY DEFINER helpers against search_path attacks.
CREATE OR REPLACE FUNCTION public.current_team_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_team_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT team_id INTO v_team_id
  FROM public.team_members
  WHERE user_id = auth.uid()
  ORDER BY joined_at
  LIMIT 1;
  RETURN v_team_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.same_team(record_team_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN auth.uid() IS NOT NULL
    AND record_team_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = record_team_id AND user_id = auth.uid()
    );
END;
$function$;

-- These are internal helpers and should never be callable by anonymous clients.
REVOKE ALL ON FUNCTION public.current_team_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_team_id() TO authenticated;
REVOKE ALL ON FUNCTION public.same_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.same_team(uuid) TO authenticated;
