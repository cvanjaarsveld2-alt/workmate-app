-- Exported from production supabase_migrations.schema_migrations (20260918120238).
-- 1) INSERT — deny ALL direct client inserts. Every legitimate join already
--    goes through create_team_for_user / join_team_by_code (SECURITY DEFINER,
--    owned by postgres with rolbypassrls=true — verified they bypass RLS
--    entirely), so this is a pure tightening with no loss of functionality.
drop policy if exists "team_members_insert" on public.team_members;

-- 2) UPDATE — did not exist before (promote/demote silently no-opped).
drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members
  for update
  using (
    exists (
      select 1 from public.team_members me
      where me.team_id = team_members.team_id
        and me.user_id = auth.uid()
        and me.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.team_members me
      where me.team_id = team_members.team_id
        and me.user_id = auth.uid()
        and me.role = 'admin'
    )
  );

-- 3) DELETE — keep self-removal, add admin-removes-other-member.
drop policy if exists "team_members_delete" on public.team_members;
create policy "team_members_delete" on public.team_members
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.team_members me
      where me.team_id = team_members.team_id
        and me.user_id = auth.uid()
        and me.role = 'admin'
    )
  );
