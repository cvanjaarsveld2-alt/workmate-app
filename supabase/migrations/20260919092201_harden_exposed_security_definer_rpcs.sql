-- Move client-callable SECURITY DEFINER implementations out of the exposed API schema.
-- Public RPC names remain stable as SECURITY INVOKER wrappers; privileged work is
-- performed only after the private implementation validates auth.uid()/team membership.

create schema if not exists private;

alter function public.accept_shared_record(uuid,uuid) set schema private;
alter function public.create_team_for_user(text,uuid) set schema private;
alter function public.current_team_id() set schema private;
alter function public.get_team_member_emails(uuid) set schema private;
alter function public.join_team_by_code(text,uuid) set schema private;
alter function public.migrate_user_data_to_team(uuid,uuid) set schema private;
alter function public.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) set schema private;
alter function public.reassign_record(text,uuid,uuid,text) set schema private;
alter function public.same_team(uuid) set schema private;

revoke execute on function private.accept_shared_record(uuid,uuid) from public, authenticated;
revoke execute on function private.create_team_for_user(text,uuid) from public, authenticated;
revoke execute on function private.current_team_id() from public, authenticated;
revoke execute on function private.get_team_member_emails(uuid) from public, authenticated;
revoke execute on function private.join_team_by_code(text,uuid) from public, authenticated;
revoke execute on function private.migrate_user_data_to_team(uuid,uuid) from public, authenticated;
revoke execute on function private.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) from public, authenticated;
revoke execute on function private.reassign_record(text,uuid,uuid,text) from public, authenticated;
revoke execute on function private.same_team(uuid) from public, authenticated;

create or replace function public.accept_shared_record(p_notification_id uuid,p_to_user_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.accept_shared_record(p_notification_id,p_to_user_id); $$;

create or replace function public.create_team_for_user(p_name text,p_user_id uuid)
returns json language sql security invoker set search_path=''
as $$ select private.create_team_for_user(p_name,p_user_id); $$;

create or replace function public.current_team_id()
returns uuid language sql security invoker set search_path=''
as $$ select private.current_team_id(); $$;

create or replace function public.get_team_member_emails(p_team_id uuid)
returns table(user_id uuid,role text,joined_at timestamptz,email text)
language sql security invoker set search_path=''
as $$ select * from private.get_team_member_emails(p_team_id); $$;

create or replace function public.join_team_by_code(p_invite_code text,p_user_id uuid)
returns json language sql security invoker set search_path=''
as $$ select private.join_team_by_code(p_invite_code,p_user_id); $$;

create or replace function public.migrate_user_data_to_team(p_user_id uuid,p_team_id uuid)
returns void language sql security invoker set search_path=''
as $$ select private.migrate_user_data_to_team(p_user_id,p_team_id); $$;

create or replace function public.notify_assignment(
  p_to_user_id uuid,p_from_user_id uuid,p_team_id uuid,p_record_type text,
  p_record_id uuid,p_record_title text,p_message text
)
returns void language sql security invoker set search_path=''
as $$ select private.notify_assignment(
  p_to_user_id,p_from_user_id,p_team_id,p_record_type,p_record_id,p_record_title,p_message
); $$;

create or replace function public.reassign_record(
  p_table text,p_record_id uuid,p_assigned_to_user_id uuid,p_assigned_to text
)
returns void language sql security invoker set search_path=''
as $$ select private.reassign_record(
  p_table,p_record_id,p_assigned_to_user_id,p_assigned_to
); $$;

create or replace function public.same_team(record_team_id uuid)
returns boolean language sql security invoker set search_path=''
as $$ select private.same_team(record_team_id); $$;

revoke execute on function public.accept_shared_record(uuid,uuid) from public;
revoke execute on function public.create_team_for_user(text,uuid) from public;
revoke execute on function public.current_team_id() from public;
revoke execute on function public.get_team_member_emails(uuid) from public;
revoke execute on function public.join_team_by_code(text,uuid) from public;
revoke execute on function public.migrate_user_data_to_team(uuid,uuid) from public;
revoke execute on function public.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) from public;
revoke execute on function public.reassign_record(text,uuid,uuid,text) from public;
revoke execute on function public.same_team(uuid) from public;

grant execute on function public.accept_shared_record(uuid,uuid) to authenticated;
grant execute on function public.create_team_for_user(text,uuid) to authenticated;
grant execute on function public.current_team_id() to authenticated;
grant execute on function public.get_team_member_emails(uuid) to authenticated;
grant execute on function public.join_team_by_code(text,uuid) to authenticated;
grant execute on function public.migrate_user_data_to_team(uuid,uuid) to authenticated;
grant execute on function public.notify_assignment(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
grant execute on function public.reassign_record(text,uuid,uuid,text) to authenticated;
grant execute on function public.same_team(uuid) to authenticated;
