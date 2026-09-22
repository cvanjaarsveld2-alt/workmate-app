-- Exported from production supabase_migrations.schema_migrations (20260919110607).

-- The private SECURITY DEFINER implementations are intentionally not executable
-- by client roles. Public wrappers must therefore also be SECURITY DEFINER;
-- otherwise the caller's privileges are used for the private call and the
-- wrapper fails with 42501 "permission denied for function ...".
alter function public.accept_shared_record(uuid, uuid) security definer;
alter function public.create_team_for_user(text, uuid) security definer;
alter function public.current_team_id() security definer;
alter function public.get_team_member_emails(uuid) security definer;
alter function public.join_team_by_code(text, uuid) security definer;
alter function public.migrate_user_data_to_team(uuid, uuid) security definer;
alter function public.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) security definer;
alter function public.reassign_record(text, uuid, uuid, text) security definer;
alter function public.same_team(uuid) security definer;

-- These functions all perform their own auth/team authorization checks.
-- Expose them only to authenticated callers.
revoke execute on function public.accept_shared_record(uuid, uuid) from public, anon;
revoke execute on function public.create_team_for_user(text, uuid) from public, anon;
revoke execute on function public.current_team_id() from public, anon;
revoke execute on function public.get_team_member_emails(uuid) from public, anon;
revoke execute on function public.join_team_by_code(text, uuid) from public, anon;
revoke execute on function public.migrate_user_data_to_team(uuid, uuid) from public, anon;
revoke execute on function public.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) from public, anon;
revoke execute on function public.reassign_record(text, uuid, uuid, text) from public, anon;
revoke execute on function public.same_team(uuid) from public, anon;

grant execute on function public.accept_shared_record(uuid, uuid) to authenticated;
grant execute on function public.create_team_for_user(text, uuid) to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.get_team_member_emails(uuid) to authenticated;
grant execute on function public.join_team_by_code(text, uuid) to authenticated;
grant execute on function public.migrate_user_data_to_team(uuid, uuid) to authenticated;
grant execute on function public.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) to authenticated;
grant execute on function public.reassign_record(text, uuid, uuid, text) to authenticated;
grant execute on function public.same_team(uuid) to authenticated;
