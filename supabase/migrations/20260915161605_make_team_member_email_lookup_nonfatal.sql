-- Exported from production supabase_migrations.schema_migrations (20260915161605).
CREATE OR REPLACE FUNCTION public.get_team_member_emails(p_team_id uuid)
RETURNS TABLE(user_id uuid, email text, role team_role, joined_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT tm.user_id, u.email::text, tm.role, tm.joined_at
  FROM public.team_members tm
  JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.team_id = p_team_id
  ORDER BY tm.joined_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_team_member_emails(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_team_member_emails(uuid) TO authenticated;
