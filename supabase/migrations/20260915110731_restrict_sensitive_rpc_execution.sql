-- Exported from production supabase_migrations.schema_migrations (20260915110731).
REVOKE EXECUTE ON FUNCTION public.accept_shared_record(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_team_for_user(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_team_member_emails(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_team_by_code(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.migrate_user_data_to_team(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reassign_record(text, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_team_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.same_team(uuid) FROM anon;
