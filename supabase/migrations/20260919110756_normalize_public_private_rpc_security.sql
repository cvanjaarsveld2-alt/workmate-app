-- Exported from production supabase_migrations.schema_migrations (20260919110756).

-- Keep SECURITY DEFINER implementations in the unexposed private schema,
-- while keeping public API wrappers SECURITY INVOKER. The authenticated role
-- is granted EXECUTE on the private implementations only; PostgREST exposes
-- the public wrappers, not the private schema.
alter function public.accept_shared_record(uuid, uuid) security invoker;
alter function public.create_team_for_user(text, uuid) security invoker;
alter function public.current_team_id() security invoker;
alter function public.get_my_effective_role() security invoker;
alter function public.get_team_member_emails(uuid) security invoker;
alter function public.join_team_by_code(text, uuid) security invoker;
alter function public.migrate_user_data_to_team(uuid, uuid) security invoker;
alter function public.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) security invoker;
alter function public.reassign_record(text, uuid, uuid, text) security invoker;
alter function public.same_team(uuid) security invoker;

grant usage on schema private to authenticated;

revoke execute on function private.accept_shared_record(uuid, uuid) from public, anon;
revoke execute on function private.create_team_for_user(text, uuid) from public, anon;
revoke execute on function private.current_team_id() from public, anon;
revoke execute on function private.get_my_effective_role() from public, anon;
revoke execute on function private.get_team_member_emails(uuid) from public, anon;
revoke execute on function private.join_team_by_code(text, uuid) from public, anon;
revoke execute on function private.migrate_user_data_to_team(uuid, uuid) from public, anon;
revoke execute on function private.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) from public, anon;
revoke execute on function private.reassign_record(text, uuid, uuid, text) from public, anon;
revoke execute on function private.same_team(uuid) from public, anon;

grant execute on function private.accept_shared_record(uuid, uuid) to authenticated;
grant execute on function private.create_team_for_user(text, uuid) to authenticated;
grant execute on function private.current_team_id() to authenticated;
grant execute on function private.get_my_effective_role() to authenticated;
grant execute on function private.get_team_member_emails(uuid) to authenticated;
grant execute on function private.join_team_by_code(text, uuid) to authenticated;
grant execute on function private.migrate_user_data_to_team(uuid, uuid) to authenticated;
grant execute on function private.notify_assignment(uuid, uuid, uuid, text, uuid, text, text) to authenticated;
grant execute on function private.reassign_record(text, uuid, uuid, text) to authenticated;
grant execute on function private.same_team(uuid) to authenticated;
