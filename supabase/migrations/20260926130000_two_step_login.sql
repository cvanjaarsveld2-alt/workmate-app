-- ── Two-step login (TOTP) ────────────────────────────────────────────────────
-- Once someone has an authenticator app set up, admin actions need a session
-- that passed the code step (aal2): company details, roles, removing people,
-- invite codes and platform settings. Companies can also require it for all
-- their owners/admins (require_admin_mfa); the app then asks them to set it up.
create or replace function private.mfa_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'));
$$;
revoke execute on function private.mfa_ok() from public, anon;
grant execute on function private.mfa_ok() to authenticated;

alter table public.team_profiles add column if not exists require_admin_mfa boolean not null default false;

drop policy if exists team_profiles_insert on public.team_profiles;
create policy team_profiles_insert on public.team_profiles for insert to authenticated
  with check ((select private.is_team_owner(team_id)) and (select private.mfa_ok()));
drop policy if exists team_profiles_update on public.team_profiles;
create policy team_profiles_update on public.team_profiles for update to authenticated
  using ((select private.is_team_owner(team_id)))
  with check ((select private.is_team_owner(team_id)) and (select private.mfa_ok()));

create or replace function public.set_member_access(p_user_id uuid, p_role public.team_role, p_can_view_team boolean) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  perform private.set_member_access(p_user_id, p_role, p_can_view_team);
end $$;
create or replace function public.remove_team_member(p_user_id uuid, p_reassign_to uuid, p_block_login boolean default true) returns json
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  return private.remove_team_member(p_user_id, p_reassign_to, p_block_login);
end $$;
create or replace function public.regenerate_invite_code(p_team_id uuid) returns text
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  return private.regenerate_invite_code(p_team_id);
end $$;
create or replace function public.set_platform_setting(p_key text, p_value jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.mfa_ok() then raise exception 'Enter your two-step login code to do this' using errcode = '42501'; end if;
  perform private.set_platform_setting(p_key, p_value);
end $$;
