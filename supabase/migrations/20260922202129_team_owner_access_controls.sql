-- Exported from production supabase_migrations.schema_migrations (20260922202129).
-- ── Master account (team owner) ─────────────────────────────────────────────
alter table public.teams add column if not exists owner_user_id uuid references auth.users(id);
update public.teams set owner_user_id = '431dcb72-ea3f-43ed-9f73-74384e862300'
 where id = '4c36881d-695c-467b-902c-45203a86a078' and owner_user_id is null;

create or replace function private.set_team_owner_on_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_user_id is null then new.owner_user_id := auth.uid(); end if;
  return new;
end $$;
revoke execute on function private.set_team_owner_on_insert() from public, anon, authenticated;
drop trigger if exists teams_set_owner on public.teams;
create trigger teams_set_owner before insert on public.teams
  for each row execute function private.set_team_owner_on_insert();

create or replace function private.is_team_owner(p_team_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.teams where id = p_team_id and owner_user_id = auth.uid());
$$;
revoke execute on function private.is_team_owner(uuid) from public, anon;
grant execute on function private.is_team_owner(uuid) to authenticated;

-- ── Per-member permission to see the whole team's records (granted by owner) ──
alter table public.team_members add column if not exists can_view_team boolean not null default false;

-- ── Timezone per user so reminders fire at local time ───────────────────────
alter table public.users add column if not exists timezone text not null default 'Africa/Johannesburg';

-- ── Only the owner may change roles/permissions or remove other members ─────
drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update_owner" on public.team_members for update to authenticated
  using (private.is_team_owner(team_id)) with check (private.is_team_owner(team_id));
drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete_owner_or_self" on public.team_members for delete to authenticated
  using (private.is_team_owner(team_id)
         or (((select auth.uid()) = user_id) and not private.is_team_owner(team_id)));
drop policy if exists "teams_update" on public.teams;
create policy "teams_update_owner" on public.teams for update to authenticated
  using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
drop policy if exists "teams_delete" on public.teams;
create policy "teams_delete_owner" on public.teams for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-- ── RPCs (private implementation + invoker wrapper, matching existing pattern) ─
create or replace function private.get_my_team_access()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'team_id', tm.team_id,
    'owner_user_id', t.owner_user_id,
    'is_owner', t.owner_user_id = auth.uid(),
    'role', tm.role,
    'can_view_team', (t.owner_user_id = auth.uid()) or tm.can_view_team,
    'request_pending', exists (
      select 1 from public.team_notifications n
      where n.from_user_id = auth.uid() and n.record_type = 'team_view_request' and not coalesce(n.read, false)))
  from public.team_members tm join public.teams t on t.id = tm.team_id
  where tm.user_id = auth.uid()
  limit 1;
$$;

create or replace function private.set_member_access(p_user_id uuid, p_role public.team_role, p_can_view_team boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.team_members where user_id = p_user_id limit 1;
  if v_team is null then raise exception 'Member not found'; end if;
  if not private.is_team_owner(v_team) then raise exception 'Only the master account can change roles or access'; end if;
  if p_user_id = auth.uid() then raise exception 'The master account always keeps full access'; end if;
  update public.team_members
     set role = coalesce(p_role, role), can_view_team = coalesce(p_can_view_team, can_view_team)
   where team_id = v_team and user_id = p_user_id;
  -- Any pending request from this member is answered by this decision.
  update public.team_notifications set read = true
   where from_user_id = p_user_id and to_user_id = auth.uid() and record_type = 'team_view_request' and not coalesce(read, false);
end $$;

create or replace function private.request_team_view()
returns void language plpgsql security definer set search_path = '' as $$
declare v_team uuid; v_owner uuid; v_allowed boolean; v_name text;
begin
  select tm.team_id, t.owner_user_id, tm.can_view_team into v_team, v_owner, v_allowed
    from public.team_members tm join public.teams t on t.id = tm.team_id
   where tm.user_id = auth.uid() limit 1;
  if v_team is null then raise exception 'You are not in a team'; end if;
  if v_owner is null or v_owner = auth.uid() or v_allowed then return; end if;
  if exists (select 1 from public.team_notifications where from_user_id = auth.uid()
             and record_type = 'team_view_request' and not coalesce(read, false)) then return; end if;
  select coalesce(nullif(full_name, ''), email) into v_name from public.users where id = auth.uid();
  insert into public.team_notifications (team_id, from_user_id, to_user_id, record_type, record_id, record_title, message, read)
  values (v_team, auth.uid(), v_owner, 'team_view_request', auth.uid(), 'Whole-team view',
          coalesce(v_name, 'A teammate') || ' asked to see the whole team''s records.', false);
end $$;

create or replace function private.set_my_timezone(p_tz text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then return; end if;
  update public.users set timezone = p_tz where id = auth.uid() and timezone is distinct from p_tz;
end $$;

revoke execute on function private.get_my_team_access() from public, anon;
revoke execute on function private.set_member_access(uuid, public.team_role, boolean) from public, anon;
revoke execute on function private.request_team_view() from public, anon;
revoke execute on function private.set_my_timezone(text) from public, anon;
grant execute on function private.get_my_team_access() to authenticated;
grant execute on function private.set_member_access(uuid, public.team_role, boolean) to authenticated;
grant execute on function private.request_team_view() to authenticated;
grant execute on function private.set_my_timezone(text) to authenticated;

create or replace function public.get_my_team_access() returns json language sql security invoker set search_path = ''
as $$ select private.get_my_team_access(); $$;
create or replace function public.set_member_access(p_user_id uuid, p_role public.team_role, p_can_view_team boolean) returns void
language sql security invoker set search_path = '' as $$ select private.set_member_access(p_user_id, p_role, p_can_view_team); $$;
create or replace function public.request_team_view() returns void language sql security invoker set search_path = ''
as $$ select private.request_team_view(); $$;
create or replace function public.set_my_timezone(p_tz text) returns void language sql security invoker set search_path = ''
as $$ select private.set_my_timezone(p_tz); $$;
revoke execute on function public.get_my_team_access() from public, anon;
revoke execute on function public.set_member_access(uuid, public.team_role, boolean) from public, anon;
revoke execute on function public.request_team_view() from public, anon;
revoke execute on function public.set_my_timezone(text) from public, anon;
grant execute on function public.get_my_team_access() to authenticated;
grant execute on function public.set_member_access(uuid, public.team_role, boolean) to authenticated;
grant execute on function public.request_team_view() to authenticated;
grant execute on function public.set_my_timezone(text) to authenticated;

-- ── Juan joins the team as a member and his records move into it ────────────
insert into public.team_members (team_id, user_id, role, can_view_team)
select '4c36881d-695c-467b-902c-45203a86a078', 'af8fb768-091b-4a47-8510-528450cee0bc', 'member', false
where not exists (select 1 from public.team_members where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc');
update public.clients   set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.contacts  set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.quotes    set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.followups set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.notes     set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.equipment set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
update public.leads     set team_id = '4c36881d-695c-467b-902c-45203a86a078' where user_id = 'af8fb768-091b-4a47-8510-528450cee0bc' and team_id is null;
